---
title: Eine Kleine Vectorized Classification
published: 2024-09-29T09:35:00
description: 'A simple technique for vectorized classification'
image: ''
tags: ['simd', 'branch-elimination']
category: ''
draft: false
language: 'en-us'
---

For the new version of my SIMD Zig parser [I gave a talk about](https://www.youtube.com/watch?v=NM1FNB5nagk) on October 10, I came up with a slightly better technique for *Vectorized Classification* than the one used by Langdale and Lemire ([2019](https://arxiv.org/pdf/1902.08318)) for [simdjson](https://github.com/simdjson/simdjson), in that it stacks slightly better.

*Vectorized Classification* solves the problem of quickly mapping some bytes to some sets. For my use case, I just want to figure out which characters in a vector called `chunk` match any of the following:

```zig
const single_char_ops = [_]u8{ '~', ':', ';', '[', ']', '?', '(', ')', '{', '}', ',' };
```

To do this, I create a shuffle vector that we will pass into the `table` parameter of `vpshufb`. `vpshufb` is an x86-64 instruction that takes a `table` vector and an `indices` vector, and returns a vector where the value at position `i` becomes `table[indices[i]]` for each 16-byte section of the `table` and `indices`. Depending on how new a machine is, this allows us to lookup 32 or 64 bytes simultaneously into a 16-byte lookup table (one could also use a different 16-byte table for each 16-byte chunk, but typically we duplicate the same 16-byte table for each chunk). Here is how it is depicted on [officedaytime.com](https://www.officedaytime.com/simd512e/simdimg/si.php?f=pshufb):

![An image depicting a vpshufb instruction. It is shown looking up 32 indices into a 32 byte vector. Each half of these vectors are operated on separately. That means the first 16 byte indices only look at the first 16 bytes in the table vector, and the second 16 byte indices only look at the second 16 bytes in the table vector.](./pshufb_3.png)

Here is the `table` generator:

```zig
comptime var table: @Vector(16, u8) = @splat(0);
inline for (single_char_ops) |c|
	table[c & 0xF] |= 1 << (c >> 4);
```

As you can see, the index we store data at is `c & 0xF` where `c` is each of `{ '~', ':', ';', '[', ']', '?', '(', ')', '{', '}', ',' }`. The data we associate with the low nibble given by `c & 0xF` is `1 << (c >> 4)`.
This takes the upper nibble, and then shifts `1` left by that amount. This allows us to store up to 8 valid upper nibbles (corresponding to the number of bits in a byte), in the range <span style="white-space: nowrap">$\footnotesize \left[0,\ 7\right]$.</span> This isn't quite <span style="whitespace: nowrap">$\footnotesize \left[0,\ 15\right]$,</span> the actual range of a nibble (4 bits), but for our use-case, we only are matching ascii characters, so this limitation does not affect us. Then we just have to do the same transform `1 << (c >> 4)` on the data in `chunk` and do a bitwise `&` to test if the upper nibble we found matches one of the valid options.

E.g. `;` is `0x3B` in hex, so we do `table[0x3B & 0xF] |= 1 << (0x3B >> 4);`, which reduces to `table[0xB] |= 1 << 0x3;`, which becomes `table[0xB] |= 0b00001000;`. `[` is `0x5B`, so we do `table[0xB] |= 0b00100000;`. `{` is `0x7B`, so we do `table[0xB] |= 0b10000000;`. In the end, `table[0xB]` is set to `0b10101000`. This tells us that `3`, `5`, and `7` are the valid upper nibbles corresponding to a lower nibble of `0xB`.

We can query `table` for each value in `chunk` like so:

```zig
vpshufb(table, chunk);
```

Just ~2 cycles later, we will have completed 32 or 64 lookups simultaneously! Note that we don't have to take the lower 4 bits via `& 0xF`, because `vpshufb` does that automatically unless the upper nibble is 8 or above, i.e. when the byte is 128 or higher. For those bytes, `vpshufb` will zero the result, regardless of what's in the table. However, we already said we don't care about non-ascii bytes for this problem, so we are fine with those being zeroed out.

Now all we need to do is verify that the upper nibble matches the data we stored in `table`.

To do so, we can produce a vector like so:

```zig
const upper_nibbles_as_bit_pos = @as(@TypeOf(Chunk), @splat(1)) << (chunk >> @splat(4));
```

Unfortunately, at the moment, LLVM gives us a pretty expensive assembly routine for the above line of code ([Godbolt link](https://zig.godbolt.org/#z:OYLghAFBqd5QCxAYwPYBMCmBRdBLAF1QCcAaPECAMzwBtMA7AQwFtMQByARg9KtQYEAysib0QXACx8BBAKoBnTAAUAHpwAMvAFYgAzKVpMGoAF55gpJfWQE8Ayo3QBhVLQCuLBiABMpJwAyeAyYAHKeAEaYxPoAbKQADqgKhPYMrh5evonJqQJBIeEsUTF68daYtmlCBEzEBBme3n4VVQI1dQQFYZHRcVa19Y1ZLYNdwT3FfWUAlFao7sTI7BxoDAoEANQb6JsApHoAIpsAAngsSfUQez4%2BOzc%2BMwcAQnsaAIJrG5sR7nR2DH2R1O50uBGut1%2B/2CDyeeleHze70wqjBmyogP4qAgyAQ7gYAGsQKcAGqVIjECB6PybdwADhmM1OABUAJ4JTAAeSoOLxhKZewA7Aj3psxZtiJgCItAScmAoICc2Rzubz8QS5qcFAkjOCuIygc4Ds5TgRiPjRARMGr%2BS8kULDvaPhj0ahUD4bUTSeSSFSafSDUr2Vyebj1QLhUjxZsvltahF6EDjmgLnY2K7sTsAHQpFjoLOSjlMcEnFKmEOK5UVsP8zXZ3P5%2By1CD00ibLixAV6I3drU64sQSSMuEi6OS6XEQEANwSCjxVAiEHj9DbNYJQOwB2wfd1g8ZdsRgsdiOd09n88Xy/Ym2MrIIwbbwXwywUxKDKp5V8DVdVX/2kY%2BaM8CoTZFWCVxU3Oa0DSFUdo3FKc6glTAFHcWgCDfH8eSfPAXy7Y58SwGgQnQA9RXgsV%2BGIUCNCzLMTgiQghDwctVXfCscLwpkAHpNgZf9nDwIUTVgqMKPg2NNifFEkykhhnxQvYAFZniEpTHXhMTxPFSVUPQ5TVOU44DmOYDQOk1QNxMzYNFUOkNCZDRNkwWglE2K8DIs/YfCU0CGKYliK3Y38mATTADV4hkjLI7SHSdciKPHGVkL0ggYvFOKTwSmMBG%2BNgCAQDAFFkjZzVsf84IolErUndFZQeWhaCnFgszs2IsyYKdVCUrgfCzc93CoLMIizHqfAeRUyVsX1YmkWkGTbE4popCBZrbAMmSWn1KTW%2BaRy0%2BDquiTF6tuRrmtaul2s61Q%2BoGoaIgmrbpspal1oW70Xr9d7A2W303r29KqtUGqTtOBqmpatqcwUJQ9H6udBuGrNerpJ6/spDsfsWjGICxvbNtx/GAyB/8NJFA6ktqhQAHdCFxPysKXUL6BggDsujZ6Vt2gMky3KSQJxVBIPTbNmTqYApUu9qqEwYtFkwIQpQACXlCAoXQ4Is2QBJ3CzWX5d0tsOq6saIhpg18sK9AFHoiGLuhm6xoR%2BdkbGiar0feTcJQpkXLck4UwSOgcGIYhfQeZxlDkdyJalTYjGQAlitQhI0SozYZ0Rhd3duOYDs53GAd5kz%2BbMoWRcwbYCHzcXiElghpf1uWJ0VlW1Y1gFtd15vDZQ42bseJkraKu2zshpvB5dpHHtuZmwq9hSFD91yq8D4Xg/obAw4j24o5jwYG4Tpgk5T9w05ILYM6zi8fNiWFSAL8Uud9Yn%2BNLvRt3LoO0yrsW48btDA2rclYEFVgqTuWsdZ62AQrBQxtYZw0tlKa2tsTj2yhldGGcNp4PRRj4NGc9PZySXivAOQcQ7b3DpSSO0dY713jonZO2xz7pxIJne6ERUYPyfmKf2VcP7bnXhcShO9KTZioCwRuP8oLKGIMEcEDwACSDBEK0DwLsCWnhGBxmDJsBI8olC7CIBw7OERiSiSPMpZwDAHjG1gsFT8LNwoOkZI/QCGUrGaUPIcDgcxaCcCUrwbw3BeCoE4AALQsNsBYSwBE%2BD0HoXgGEOBaDcQgOWWAYgQDmESJStEuB0h8BoQUiS9BcEFFwJSkgDABI4JIXgLAJAaA0KQEJWhSDhI4LwV8rSUlpNIHAWASAKH0DIBQCum8%2BimA0FwPQrSaDoWiK%2BdWmheCMWYMQVknAeCkA2XUVknIIjaHJDs3gKY2CCE5AwWg2zUm8CwL8YAzgxCuTOaQLALBjDAHEPcj5eBJRVCnChNZ/hVCVHcFad5CiXKgvUREYgBzXBYFBWac47zgXEAiMkTAhxMBfJMOokway5hUCMMABQJI8CYBppyDkITdn8EECIMQ7ApAyEEIoFQ6g/m6C4IYb5IBzCWHha%2BSAcxUAJDsLlTgABaTkmwABKLk5ZKAAGLyi2LKw%2B8c2oAH1ZqyqJe4SysqWDQJMqYVR0QkmdMxfIrAYqclWBVW0bwEAnDDG8PywIEwiglAkDkFI0r0huCaIGpIwa0jdH9X0flrQQ0dCGGGrI8bXWJrGDG3oMR41jC9YGjYnQs1TBzXMBQsTlj6H8YE4JoKumbGFTZFG8MnIQFwIQdhNxEkzGSSSuYGSmBZMoLkkAkgACcWY6QVLHT4WIc6il0kkEpOkSlDCcAaaQJpXAWltLrZwHpIA%2Bl9rXRwHwta/ldN7fctxmKUgOEkEAA%3D%3D)):

<div id="issue-dump" style="display: flex; flex-direction: column; align-items: center; align-self: flex-start">

</div>

<script>
    document.getElementById("issue-dump").innerHTML = [110317].map(i => `<div class="individual-issue">
<div><svg id="issue-indicator-${i}" class="issue-indicator issue-indicator-unknown" viewBox="0 0 16 16" version="1.1" width="20" height="20" aria-hidden="true"><path stroke="none" fill="#59636e" d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm9.78-2.22-5.5 5.5a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734l5.5-5.5a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042Z"></path></svg></div>

<div>

<p><a href="https://github.com/llvm/llvm-project/issues/${i}">llvm/llvm-project#${i}</a></p>

</div>
</div>`).join("\n\n");
</script>

```asm
.LCPI0_1:
        .zero   32,16
.LCPI0_2:
        .zero   32,252
.LCPI0_3:
        .zero   32,224
.LCPI0_4:
        .byte   1
foo:
        vpsllw  ymm0, ymm0, 5
        vpbroadcastb    ymm1, byte ptr [rip + .LCPI0_4]
        vpblendvb       ymm1, ymm1, ymmword ptr [rip + .LCPI0_1], ymm0
        vpand   ymm0, ymm0, ymmword ptr [rip + .LCPI0_3]
        vpsllw  ymm2, ymm1, 2
        vpand   ymm2, ymm2, ymmword ptr [rip + .LCPI0_2]
        vpaddb  ymm0, ymm0, ymm0
        vpblendvb       ymm1, ymm1, ymm2, ymm0
        vpaddb  ymm0, ymm0, ymm0
        vpaddb  ymm2, ymm1, ymm1
        vpblendvb       ymm0, ymm1, ymm2, ymm0
        ret
```

Luckily, there is a very easy way to map nibbles to a byte. Use `vpshufb` again! Actually this works out better for us because we can map upper nibbles in the range $\footnotesize \left[8,\ 15\right]$ to `0xFF`. We'll see why later.

```zig
comptime var powers_of_2_up_to_128: [16]u8 = undefined;
inline for (&powers_of_2_up_to_128, 0..) |*slot, i| slot.* = if (i < 8) @as(u8, 1) << i else 0xFF;

const upper_nibbles_as_bit_pos = vpshufb(powers_of_2_up_to_128, chunk >> @splat(4));
```

Much better emit! ([Godbolt link](https://zig.godbolt.org/#z:OYLghAFBqd5QCxAYwPYBMCmBRdBLAF1QCcAaPECAMzwBtMA7AQwFtMQByARg9KtQYEAysib0QXACx8BBAKoBnTAAUAHpwAMvAFYgAzKVpMGoAF55gpJfWQE8Ayo3QBhVLQCuLBiABMpJwAyeAyYAHKeAEaYxBJ%2BAA6oCoT2DK4eXr6kCUl2AkEh4SxRMVx%2B1pi2KUIETMQEaZ7eZZg2uQzVtQT5YZHRsVY1dQ0ZZYNdwT1FfaUAlFao7sTI7BxoDAoEANQb6JsApHoAIpsAAngsCXUQez4%2BOzc%2BMwcAQnsaAIJrG5sR7nR2DH2R1O50uBGut1%2B/2CDyeeleHze7yogPccTi0QA%2Bgw8BEIvQFJimISIoRMdlsUw8AA3TAQZAIdwMADWIFOADUKkRiBA9H5Nu4ABwzGanAAqAE8MQB5Kj0xks0V7ADsCPemw1m2ImAIi0BJ2JEBOkplcoZTOZc1OCjiRnBXBFQOcB2cpwIxCZogIdPNipeSJVhwDH0wqjBmxRAvRWJxeIJRJJZOy8otbJOnNsJF5/KFjuNUswspTiv2qqRms2aAudjYm2ptU2CQA7tFCagqJifJi0ZiiJjSoK2XsAKzPLgANhHhyFQOOTKwNBC6H9HwrwVoEwjJE2EPHzdbmPbne7cV7qH7PkFpE2GgAdLelcrnAAqBS0VAEa94FWut8f2/PrOmx4FQO54E6mzCqchpCteDpOi6wGbC0Sg3qoABi6EruqmrarqxCAtScQKIyVARBA%2B7EG2HZdj2fYDtevrMkC2AHNg1q2kw4KSCK2GBsGyKEcRpHkTU%2BLsJsxgSgQBZfgw%2BDLAobJSTJGKiiBO4nEkpiFnK%2BamhAwQKZgCiOmx1p4DpRb6bpEBifQIqijZRZGXgimiihmDigWRb2Zgj5qhWXxbEIcgAOJhdgQhitghyYuy2DOJiQgAJIAFrYEOejoVWcQ1pgmLBFsBzHDst5JCw6Dle4wDACZBAZtyASMMABAIOhJDOHE7gQLBPx/LQAK3sg3Vwmq5aahpRrBK41bnHSorbqFEVRTFcUJUlqUZbOJWbAw7i0LQAUTRWGr1sQWomQdBBpiatmue5QHzpgi6YMu8Inad/AXRAd63icpLCJZtnOXKD0mY6AD0kGPs435PqWgWncjwXAfJoZAeDCgjs837DkGH2rsjp3ago1043jxy7VNRkY2xu0aKogoaKKGjIbQqF%2BRT6OqPsPjDppgNCMD1l3b5TDiVDMNTthxOlkGiJE8jeF6pdZODbLmr8YrOEalNWki3pYtg/JbkQ0qejsQbVlGz5cp%2BY5iOfRWKsEXWwnuGREBlRVVXahiXFGtpIPG4ZpvuVaDtycZpmaxq2vvJ9%2BvB6Ldt2RLDkW%2Bxy2RdFsXxYlyXpdgt4HOhx1K6d52Np0Sn7KO1sh2nDuitDOerfnG1FxlpfZVO6Zclm7d5%2BthdbSXZfXrmT3o6971I8j66bt9O43HutfXn9sOvu%2Bn7AT%2BTuV3Lf4EABQFESRnvkT75xVaG7pMLY6fiV%2BmyAcPa0F5txe9%2Bh14f53MeP8y5WhvpVW899iCP3BFjV%2B79wq50/l3cev9/4II7qPb%2BPcQFjWdlrZUCtdYkx1KrAGhBnDEnBHEWuuDK4J0%2BqjNgbUMAKCAhsD0thD5EIrPfaIgJIwnAeIdakLBbxM3HLeJg1JVDDlKLeD2VBbwRFvLInwDwjSNSzOOaQAphTXgHpmHk2ip7CicpooxOjcxx1Orwt2AihG0BEWIwUEipGqB8PIy%2BiiIjqIMdybMJirR%2BKzHyQJZjB48lCbo2h3DNS2P4fqBxTjxHlQUEoPQnjSJKNvAOXx5iIATkCfo/JhTonhMMQU8cgTrH8UJonSurtAQKCbIQBkmlQ4ty4XLYJFjAk7UtsBUC9JUBzVrGVMUtQ6qnxSVQTAXFFiYCEDqAAEoaKEg1gjDW6reWZ8zSbXkkdI1REQmyOiYQgFh/0kmiJSW41RmTPbZNUeovy0czamXZqhE4uU6A4GIMQLMDxnDKDkJsQYUzNhGGQMyVhZN0QkC2CvC%2BIlnm3DmHgjUPSAnRP6exKauV8rbAIFVCZxApnOIkbs/CiyVlrIGkNEa7gdlzOpQoA5bjHiinOZcwRtxhE3JcYc9xDzvEvIzpgN5j1PKnB%2BfQbA/zAW3GBaC8FOpIWPxhdsNE4YkUKIiPzScaLSAYo5BEypfSSrmXxSMvK80iUksmTqClzK9k0oIKshQEB1kMu2VShZbLNipPSWcnUFz0AKCuXyxxAqJFpPSSK7JuTbjP3oJKiGnyvLfJtb8%2BVAKeRApBWCx1WwoWarhTq7cyKr5JseMao%2BcSOZeUtQMrNFwc0Kp5GVKgLBT4EvmsoYgRUIQ%2BBSgwesG5diTM8IwLYqkvLULSW9MFqB3ZeIiEOMsBCRzOAYA8A5KpnigxTf5QMIo61ENqeNAhHA5i0E4MOXg3gOBaFIKgTgaULDbAWEsJtPg9B6F4DdZ9N65gIDmVgGIEA5ismHHeLggofAaGVP%2BvQXBlRcGHJIAwd6OCSF4CwCQGgNCkCfS%2Bt9HBeBKWI0BrQcw4CwCQLK6I5BKBMZiKYDQXA9DEZoINVslB13AdIKSZgxAJScB4MJ4ItQJTSgiNoLkEneBVjYIIaUDBaDiaE1gX4wAKGHSUtwXgWAWDGGAOIbTeBtSVFpIZl9oYKjuG9Ep8gggWiaF4BuCIUCxOuCwB50g7pzgudpMQCIiRMCHEwKZkwG4TAebmFQIwwAFDsjwJgJs0oMRPsk/wQQIgxDsCkDIQQigVDqCE7oLghgzMgHMJYLzSlIBzFQLagQhmAC00pNgACUWhzKUOhShmwOuqq2OIzE2iOtxfcLzDrLBGUlVMGO6IAHX2hcHVgJrUGrD9cqA4CAThhhNGI4ECYhRij6GkNkZIAhju%2BGIzdto3QLt9D0NIco%2B32hjHu8qXbrQqhjBe70GIBgNidF%2BwMTowOpig7mAob9yx9C3vvY%2BgL5HNj1ZvDkjJbMIC4EINuG4/6ZiAYS6B8DfQduskkAATlvIKNDtOfDjlZwhwUkhhyCmHIYTgeHSAEa4ERkj6POCUZANR8nvOOA%2BDR0J8jZPgNntC0kBwkggA))

```asm
.LCPI0_0:
        ...
.LCPI0_2:
        ...
foo2:
        vpsrlw  ymm0, ymm0, 4
        vpand   ymm0, ymm0, ymmword ptr [rip + .LCPI0_0]
        vpbroadcastb    ymm1, byte ptr [rip + .LCPI0_2]
        vpshufb ymm0, ymm1, ymm0
        ret
```

Now we simply bitwise `&` the two together, and check if it is non-0 on AVX-512 targets, else we check it for equality against the `upper_nibbles_as_bit_pos` bitstring. I wrote a helper function for this:

```zig
fn intersect_byte_halves(a: anytype, b: anytype) std.meta.Int(.unsigned, @typeInfo(@TypeOf(a, b)).vector.len) {
	return @bitCast(if (comptime std.Target.x86.featureSetHas(builtin.cpu.features, .avx512bw))
		@as(@TypeOf(a, b), @splat(0)) != (a & b)
	else
		a == (a & b));
}
```

This gives us better emit on AVX-512 because we have `vptestmb`, which does the whole `@as(@TypeOf(a, b), @splat(0)) != (a & b)` in one instruction, without even using a vector of zeroes! On AVX2 targets, we have to use a bitwise `&` either way, and to do a vectorized-not-equal we have to use `vpcmpb`+`not`. Hence, we avoid that extra `not` by instead checking `a == (a & b))`, where `a` has to be the bitstring that has only a single bit set, which is `upper_nibbles_as_bit_pos` for our problem.

So here is everything put together:

```zig
const single_char_ops = [_]u8{ '~', ':', ';', '[', ']', '?', '(', ')', '{', '}', ',' };
comptime var table: @Vector(16, u8) = @splat(0);
inline for (single_char_ops) |c| table[c & 0xF] |= 1 << (c >> 4);
comptime var powers_of_2_up_to_128: [16]u8 = undefined;
inline for (&powers_of_2_up_to_128, 0..) |*slot, i| slot.* = if (i < 8) @as(u8, 1) << i else 0xFF;

const upper_nibbles_as_bit_pos = vpshufb(powers_of_2_up_to_128, chunk >> @splat(4));
const symbol_mask = intersect_byte_halves(upper_nibbles_as_bit_pos, vpshufb(table, chunk));
```


:::note
This properly produces a `0` corresponding to bytes in `chunk` in the range $\footnotesize \left[\mathrm{0x80},\ \mathrm{0xFF}\right]$. This is because `vpshufb(table, chunk)` will produce a `0` for bytes in `chunk` in the range $\footnotesize \left[\mathrm{0x80},\ \mathrm{0xFF}\right]$ and `vpshufb(powers_of_2_up_to_128, chunk >> @splat(4))` will produce `0xFF` for them. `intersect_byte_halves` on AVX-512 will do `0 != (a & b)`, where `a` is `0xFF` and `b` is `0`, which will reduce to `0 != 0`, which is `false`. On non-AVX-512 targets, `intersect_byte_halves` will do `a == (a & b)`. Substituting the same values for `a` and `b`, we get `0xFF == (0xFF & 0)`. This properly produces `false` as well.
:::

Compiled for Zen 3, we get ([Godbolt link](https://zig.godbolt.org/#z:OYLghAFBqd5QCxAYwPYBMCmBRdBLAF1QCcAaPECAMzwBtMA7AQwFtMQByARg9KtQYEAysib0QXACx8BBAKoBnTAAUAHpwAMvAFYgAzKVpMGoAF55gpJfWQE8Ayo3QBhVLQCuLBiABMAVlInABk8BkwAOU8AI0xiXw1SAAdUBUJ7BlcPL18A5NS7ARCwyJYYuJ8E60xbdKECJmICTM9vaSqagTqGgiKI6Nj4q3rG5uy24Z7QvtKBioBKK1R3YmR2DjQGBQIAai30bYBSPQARbYABPBZkxogDnx89u585o4AhA40AQQ2t7aj3Oh2BiHE7nS7XAi3e7/QGhJ4vPTvL4/HZMBRKRog057AB0WH%2BwBxaIxBDeH0%2B5JR2yEcgA4rTsEIACrYY4AfQAathnGyhABJABa2CxuwI6BxqRY4oU7mAwEwWw51SIxCCjGABAQADESM5Eu4IO4ABykP4A2hAnHIfUIpHfAS/ZwIdwMADWIrOStsJAgNPpjJZ7K5PP5QpxRy1puNtvJ5Mwqgh2yowJoDBcCAaCj5DCEmEhyGdbpA5y9Kogeh8UaNczmovFbHqOOzkJxLtSwDC6FNZwIAE9Ephs/wIGcmf3MAB5KgQAsu101nEAN2VJBx9AYtYOAHY7ds99sqakTPQ2QWGmzUIkFCKDn5Xmzb8djdvXtswBwAH7v03v8C8N8cG834AberzAe%2Bj7gYBehalBEBQXMUEvkhW7HFBpDvocqFkl8%2B4HqgVx2Gw2yLg02y0KgqCuu4iRsvUUTiCWK7EBAXAAGxVpuoJnAoiRGJCGgxrh%2B6hLQUxJiQ2wQEewAnmexAXlem5bs4yDbs45GUdRtH0fQoHIIcPhsdsGiqFqj5Yc4RynFwIJWXoGkziC2BHMKkhCZ8eFoIRlyYCRZHJAA7rECgXlQbI%2BGyNF0agbJcD4RrFqB7GPsaIoulgqaYOgOGeSJDBiWEEnEFJdxsUFIVhRFUU6bF8UmiZOI4spzgAFQKBRBCmng6m7J1OKtSKeBUFJeB2ds1bnGihoNVwXH2RpY2YLQSgmWZ5mIrGwl7lSNEDgpDB4FEDEKmyaJslEhBsnkIqLlezpUFEEAVcQoWoOFkXRUQcUJaas5us5rnnLx/EQO5HleQ6OwKL2pRuGyLBou61nbKEBAhcqF29ujbIZrQy4KIaiT7Wyh3HfQoXnZdBDXSkpp3QoD1PRRVFfUwJ1/YW84Q/uxB5sswIw3DtAI0juXbscW2fMmqOCBjthYzjeMExATDFsY2PjqaUTqwwmsDrWuINkwTaCBArabBYnbdn2A5DqgI5jgOU6q9rC7Lt6xBrowyl2h8ACcxKxJCuKSuKaAugQTLEO4CojskiSuJHqtcZL3HTaO44u0wbvdiDTCQnNNZYijPbjvbjtZ9OOd/O7zHexu4tfAHfMEAL5zU84aKQsNUneYkRF%2BbiTINPKBA4qoRpsTiVCYAXyyYLmBAABLTTCFqhFa%2Boz3Pbd8woppEouqh%2BPFUSBTWW3%2BwHZwZ07k7V7nwN8QXECCbWYBgCjquGcZUQvM3DQ/tlpKCvgHJgJdQQ/zKrXDyEspYywZkzCAul2DbA1rbTA3U0x4FWAoXW%2BtMC1l7iOVIpgH6V2dtOUI%2BA8HFyBjxPA5CXaZyoSg9m9Aay1lYRQmhuCFS1hAX5HhLtUG%2B3JHhEhFwMgEQHr5CA9CdwSLwvuUiJV97uAtMWER1CcF0PSmmTAWUcqbW2io/gJU35NTONTIQTCKE6IgHwuhtYAD0E0Wo9RUlhXcKi/FUhofGIaeiFSgR6n4NOvi/F4Q0RaMJFkUYkMCaoQGoJTJGkEiZbYQjtioLCYYlJdw/BSRsYQOxzDpyOLEW4jxj5crRKwpLQBeU/Gt3brE0kpiWmNKlpIkapD7EsPvi7ZxAiuLCkYRUyhFDqniLMTE/mxBgRIPcI9aSYoJSXHFHzAcr9JkOOGbo2hYzTRiOwcchQPM9zwOaX0kpZCDlV3YSdehehhR%2BgZMyVknJuS8kFNgcMME5ndLwmo7YiRuj4MOHefZQynnVO2O4j5AZvnBj%2BWGCMj5PTMV9HST5gYfkhn%2BYCyM2xowGMylMExUSVGiXEhY0qRkIWNAPo1Zqll2qdW6r1F8yiGl7g6qgceg0UYrLWaHLZOJ4wEGIEwWwzz6DdW2INZFXygy/NDACiMppVUErRZqklCw6ybKlFK1QMq5U9xCaysaKq8UovVUSjFMEdX2rVYS9FWqgVXJUTckFvNFnAlKU0buz1IU%2Br9Xy/CmwdgNgQBga8KMtgx1sD4qNeFpWxBTEGp4tB8YsAnlPI%2BJ94o4nuqsnEUQcSnx8E8EcpYfRsWkGS6s3YG0sSbZxbh7aICdpbT6jN5qs1JhzfcPNi4C2T2nkwY%2BPgy2MwrVEOt2LPblkrP2ttOKKxdqYqu7d/b6nRMzUskd5xc35sLdPdESg9DzoepWnE9Vl09vYpxTdq7X39u7Tiz90ZD3XOwl0qNbST0KECoQAsJTDkKqIcChpK6yx9vJdZIGJD%2B6D2NSPYgY9L073nnzJeq9Cbr0tNadweG94KkPjOktPhz7FzjQmnEZxz0TtwzRmtd7F3VvinW1B5z%2BGXOyStYR/c6A4GIMQH0TxnDKDkLk0eeZyJytdNeGUxMSA7AZWKqINb4SkHTfuBDPp93IZOKh/p6HfKYcU%2BPKdFGF6EbXuaUj29Z74ao9sYtzxayMfQAoZjrHJ1Fpo3O8tVBK18Y4Vg2WFzBEifOGJ%2Bg2BJPSfuLJ%2BTwwx7KeQKp3Ye1NPFRIuFqI/g2L6cM3uYzLFf2TRQ281GlnZEYeHrZ3D7nKNOeIy5zeZGHP70PtezAegGN5njf5wLY6L32aG7e8LD6n33BgwJ/ROSzhJYk1JliMm5MKew0powuW1MFcxNpkri3ngGfmfuHJ9WJkbZS1t9Z4oqAsHHlZtgyhiBoyhD4bMpExL7FHp4RgOxMHgqDvsIgxWF2PSSko7CfhnAMCeIfF8VTosvFQjWK73T4FAdQhwBYtBOB%2BF4N4DgWhSCoE4AKCwuwlgrD8ncPQeheAEE0EThYCA55YDiAo0groQBsVvZIPwbF/ZcC3BoDQRo/D3B8FwQwnBJC8BYBIGXpAKdU5pxwXg%2BCEgc8p0T0gcBYAwEQCgWR4myAUBnNb%2BgcRTAyrnHwQEIVKA62N6QS6zBiC9k4DwH3oQGi9gnFEbQypA%2B8G8mwQQE4CoB%2B9/iWUXc834O4LwLAiNjxrCp/gPmNQCac8CKoao7h0bR/IHLEn3uxJRFlf71wWAS8ysuFX5cxAogpEwMcTAOfZKhFAMbhYVAjDAAUByPAmBAoTgHBToP/BBAiDEOwKQMhBCKBUOob3uhKxGBMCAcwlh6/4MgAsS8BRNicAALQTm2AAJWWnPJQWpu7bBv1lpTU62RNpv4VdwFJG/FgMjayUwBgTvNnanTvb7LAM/AXdoK/RwNMUYbwJXYIKYEoMoCQJIFINIAQVAnAvIfAhgXoLAgYJXRA2oCYQgyg5/DoHMCYMg/oOISgmgtwFoHArYboZgmYVghYBQRnVYfQYnUncnEvXXbYY/XJGOAGCAXAQgSSFnEbdnTnHHHnJgPnSgBYIXPQaePwSQPQWXHwf2SXSQLcCw/2DiWvVXUgdXPwBIbXXgXXfXEAQ3NQ03C3CAJADbW3SgXwo/F3N0N3C0D3CAL3KnX3UPKvKI/3cPSPWwKvWPUHBPWgJPfPTAAkNPFaKvbPYwWSPPLPPAQvOwYvb3eMcvSvTPavdGWvKnevRvXsZvQo0gNvdXaozvbvJQPvAfQqYfLQUfcfSfafWfefKvJfYQUQcQdfCYrfNQEvXQJXA/MwCwQwI6eAi/ORB0W/e/J/egNETAN/X4T/WzbYH/P/AAoAkA/UMAiA2IWw1AGAvAOA%2BAAQ%2BgpAiAJwWgwINMXg7ApXYgq/b4wE9IP4igqwd46g7ob4qgzoJgzAlgrg9grINAoYHghEvgiQAQoQ9gEbZXDgMnLXCQzgKQ%2BnII90eQ/AFUQyVnOYVQkfbnXnAYAXGwtXEABwok73FwqwNw1otQnQ/QfQww4w0wqQCwrcKw/EqApw6nTgekgY0QjgHwcQrkuUvkhk0gTvVIBwSQIAA%3D%3D%3D)):

<div id="issue-dump2" style="display: flex; flex-direction: column; align-items: center; align-self: flex-start">

</div>

<script>
    document.getElementById("issue-dump2").innerHTML = [110305].map(i => `<div class="individual-issue">
<div><svg id="issue-indicator-${i}" class="issue-indicator issue-indicator-unknown" viewBox="0 0 16 16" version="1.1" width="20" height="20" aria-hidden="true"><path stroke="none" fill="#59636e" d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm9.78-2.22-5.5 5.5a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734l5.5-5.5a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042Z"></path></svg></div>

<div>

<p><a href="https://github.com/llvm/llvm-project/issues/${i}">llvm/llvm-project#${i}</a> gives us some dead data, which I manually removed</p>

</div>
</div>`).join("\n\n");
</script>

```asm
.LCPI0_0:
        .zero   32,15
.LCPI0_3:
        ...
.LCPI0_4:
        ...
findCharsInSet:
        vpsrlw  ymm1, ymm0, 4
        vbroadcasti128  ymm3, xmmword ptr [rip + .LCPI0_3]
        vpand   ymm1, ymm1, ymmword ptr [rip + .LCPI0_0]
        vbroadcasti128  ymm2, xmmword ptr [rip + .LCPI0_4]
        vpshufb ymm1, ymm2, ymm1
        vpshufb ymm0, ymm3, ymm0
        vpand   ymm0, ymm0, ymm1
        vpcmpeqb        ymm0, ymm0, ymm1
        vpmovmskb       eax, ymm0
        vzeroupper
        ret
```

<script is:inline>
{
    const open = '<path stroke="none" fill="#1a7f37" d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"></path><path stroke="none" fill="#1a7f37" d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z"></path>';

    const closed_completed = '<path stroke="none" fill="#8250df" d="M11.28 6.78a.75.75 0 0 0-1.06-1.06L7.25 8.69 5.78 7.22a.75.75 0 0 0-1.06 1.06l2 2a.75.75 0 0 0 1.06 0l3.5-3.5Z"></path><path stroke="none" fill="#8250df" d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0Zm-1.5 0a6.5 6.5 0 1 0-13 0 6.5 6.5 0 0 0 13 0Z"></path>';

    const closed_not_planned = '<path stroke="none" fill="#59636e" d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm9.78-2.22-5.5 5.5a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734l5.5-5.5a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042Z"></path>';
    for (const issue_id of [110317, 110305]) {
        fetch(`https://api.github.com/repos/llvm/llvm-project/issues/${issue_id}`)
            .then(e => e.json())
            .then(e => {
                const svg = e.state === "open" ? open : e.state_reason === "completed" ? closed_completed : closed_not_planned;

                for (const e of document.getElementsByClassName("issue-indicator")) {
                    if (e.id === `issue-indicator-${issue_id}`) {
                        e.classList.remove("issue-indicator-unknown");
                        e.innerHTML = svg;
                    }
                }
            })
    }
}
</script>

<style>
.issue-indicator-unknown {
    transform: "rotate(45)";
}

.individual-issue {
    display: flex; flex-direction: row; align-items: center; align-self: flex-start;
}

.individual-issue > div {
    margin-right: 0.5em;
}

.individual-issue > div + div {
    height: 2.3em;
}

.individual-issue > div + div > p {
    margin-top: 0;
    margin-bottom: 0;
    line-height: 1.5;
    white-space: nowrap;
}

p + div#issue-dump {
    margin-bottom: 0.5em;
	margin-top: -1.5em;
}
</style>


Compiled for Zen 4, we get ([Godbolt link](https://zig.godbolt.org/#z:OYLghAFBqd5QCxAYwPYBMCmBRdBLAF1QCcAaPECAMzwBtMA7AQwFtMQByARg9KtQYEAysib0QXACx8BBAKoBnTAAUAHpwAMvAFYgAzKVpMGoAF55gpJfWQE8Ayo3QBhVLQCuLBhI0AmUk4AMngMmAByngBGmMQSBgAOqAqE9gyuHl4%2B/onJdgLBoREs0bFcBtaYtqlCBEzEBOme3lx%2BVpg2eQw1dQQF4VExcVa19Y2ZLf4KI70h/cWDZQCUVqjuxMjsHGgMUwDUU%2Bi7AKR6ACK7AAJ4LIn1EEe%2BvgcPvosnAEJHGgCC23uR7jodgYxzOl2utwI90eAKBIRebz0nx%2BfwIuyYCiU9VB5wOADosADgHiMViCB8vt9KajdkI5ABxenYIQAFWwpwA%2BgA1bDODlCACSAC1sDj9gR0HjkixJQp3MBgJgplzKkRiIFGMACAgAGIkZzxdwQdwADlIu1htGBeOQhsRyN%2BAj2zgQ7gYAGsxRcVbYSBA6YzmWzOTy%2BYKRXiTjrzab7ZTKZhVJDdlQQTQGC4EHUFAKupgochXR6QJcfWqIHp/LtY4txZK2LU8bmoXi3clgKF0OaLgQAJ7xTC5/gQC4s/uYADyVAghbd7sWizxADdVSQ8fQGLWjgB2B27fe7GnJEz0DmFuoc1DxBRio4AVneHPvp1NO/euzAHAAfp/zZ/wLwH4cB8v5Afe7ygZ%2Bz6QcBeg6jBEAwYsMFvih26nDBpCfsc6EUj8B6HqgNx2GwuxLnUuy0KgqDuu48QcrUkTiKWq7EBAXAAGwxiaW5ghcCjxEYUIaHG%2BEHiEtCzCmJC7BAx7AKe57EJe15btuzjIDuziUdRtH0Yx9Dgcgxy%2BBxuwaKoOrPjhzgnOcXCgrZejaTOoLYCcoqSKJ3wEWgxHXJgZEUYkADuMQKJeVAcr4HJ0QxqAclwvgmiW4Gcc%2Bppim6WDppg6B4T54kMJJoTScQskPBxoXhZF0WxfpCVJWa5l4nianOAAVAoVEEOaeBafsPV4h1Yp4FQsl4I5uw8ZcGLGs1XC8U52mTe0SjmZZVlIvGYn7jSdEDspDB4JETFKhyGIcpEhAcjkYpLterpUJEEDVcQEWoFFMVxUQiXJeas4em5HmXAJQkQF53m%2BU6aIKL2xRuByLAYp6dm7CEBDhaqV29pjHJZrQK4KMa8SHRyx2nfQEWXddBC3Uk5oPQoT0vVRNE/UwZ0A0W85QwexD5msIJwwjtBIyjBU7qcO3fKm6OCFjtg43jBNExATAlsYuPjuakSaww2sDrW%2BINkwTaCBArY7BYnbdn2A5DqgI5jgOU7q7rC7Lqx66MGpDpfAAnKSMRQvi0qSmgboECyxDuEqI6JPErhR%2BrvHS3xc2juObtMB73Zg0wUKLQuOJoz246O872fTrnFqeyuvrED7m6Sz8gcCwQQuXLTzgYlCY2yX58QkYF%2BIsnUioEHiqgmhxeJUJghdrJgQj5gAEnNlrWra7jz4vncCwo5okkuqh3klkQhQuO0B4HFyZy7k413noOCYXEAibWYBgGj6smWZkQ3htw0AHNamAb6ByYKXMEf9Kp128lLGWcsmYswgAZdg6IDb20wH1DMeANgKH1obTAtYB4jmSKYJ%2BVdXbThCPgAhJcQb8TwJQt2WcaFoM5vQBctZ2FULofgpUtYwGXEfm7dBftKQETIVcNIRFh4BQgIw3cUiCIHnIuVQ%2B7grQlj4W7ARDCsoZkwLlfK21dpqP4OVD%2BrULi0yECwqhejaF4IYbWAA9NNdq/V1I4T3GogJNI6GJlGq4pU4F%2Bp3nTv4gJBEtFWgidZNGZDgmqGBmCCyJoRLmV2CI9BETjFpIeHeWSdjCAONYdOZxnCzol08TxZ8BVYk4WlsAwqASO5d3ieScx7SWky2keNchji2FiJcfQoRvFRTMMqdQqhEjlExLUZ04gIIUHuGenJCUUpriSgFgOd%2BMynFjIgAYyZ5oJG4ImQoPm%2B5EFtMGaUihxzq41O4VM2kDImSsnZNyXk/JhTYEjHBSRFiCIaN2PEHohDjgPiOaM15CzdieIDN84MfywyAuBVZKJ3pWL%2Bi%2BUGX5oYAURijNxNO1ZjGmKabEiSUkrEVVMlC%2BoR8WptRsl1HqfUBpvlUc0/c3VUBTxGmjdZmyw67LxImAgxAmC2DeTg9GuwRqoqJSGf54YgXks%2BYGH5GrMVkpBeaSVMppWqFlfK/uYS2WTVVYS/VGLSXarguaNVjqSVauxdfXpzT7l9LiYLVZ3dCC9ymK9aFtz%2BkPIPDSBsCAMA3jRlMWOtg/H8rUTKmIaYQQXBeLQQmLBp6zxPmfJKeJHobLxJEPE59fAvBHGWP0HFpDVh4t2JtbEW0Ut4Z2iA3a21RoIlm4Ncs82PALUuItM855MFPr4CtzMq2RAbXixuFYqyxg7fiysPaWLrt3YO2lASR05suPmwtxa56YiUHoRdT1q14iaquvtnEKXbvXW%2Bwdvb8VftjMe/pvSM0rOFiFQghZSknKRXysFB413lgHbGaBooyFDxHnWPE49iCTyvXvJeAtV4EA3sTLeIQbSGjwwfJUx851lt8JfEu8bE14nHb4Sd06S20brfe5dtakoNvQVcwRNzcm0HWhcIedAcDEGIH6F4zhlByF2CMSelF5XuhvHKUmJA0SMvFZEOtCJSAZoIvBv0h6kN2RBqh%2BR6Gx4T3zLhhe%2BGV7r03oCK0ZGd6UeXmy0trxaxMfQAoFjF6p24dowuytVBq0Ca4Uqs5ImRESfkVJ7AMm5OPAU0plT%2BY1PIA0/sA6OmypkWi5EXwd4OJGZM3B19XFB3IfRkMtDAUMNYZwzOnzBG3MkY89vCjzmqN%2BZvZgPQjH8wJuC6Fidl6uujbvdFx9z7HiKqE4Y5Lkn6Dpdk2xeTinlMObREYArmnivYj0%2BVlbrxjOwf3CIqzehplbek7trZkoqAsCnq1tgyhiAY2hL4XM5FJKHAnp4RgaJsGQuDocIgZWl3PVSio3Cd5nAMBeMfN81SJFSwXLdvpiCgPoQ4MsWgnA7y8G8BwLQpBUCcCFBYfYqx1iBQeHoPQvACCaFJ8sBAi8sCxCUaQd0IAOJ3skFVgOXBtwaA0CaO8jxfBcEMJwSQvAWA%2BA0KQantP6ccF4IQ7X3Oaek9IHAWAMBEAoFS/QMgFAZy28GKYWVc4%2BBAnCpQPWpvSDXWYMQXsnAeC%2B5CHUXsE5IjaFVEH3gfk2CCAnMVQPPvCTyl7gWwh3BeBYGRieTYtP8ACyqETHnARVCVHcJjGP5AFbk595JSIcqA%2BuCwKX2V1xq8rmIJEJImBTiYFzwpEIoBTfLCoEYYACguR4EwCFCcA5qfB/4IIEQYh2BSBkIIRQKh1A%2B90P4IwJgQDmEsA3whkBlhXk6JngAtBOXYAAldoi8lA6j7rsG/uW0Qzo5C2m/JV3A0kb8WAd47JTAGAu9Oc6cu9/ssBz9hcKgqgHAIAnAxhmgAgMw%2BgigSgJBSAcgUgBA0DcD8DOgsCBhSg2gOhqhpgiCVdEDOhuh6gyD5gKCpgehaDhgehmCcDFoVg1gNh9AycKcqdS99ddgT9lNY4gYIBcBCAZJ2dxsuced8d%2BcmBBdKBlhRc9A547xJA9B5dfAA5pdJBtxTCA4uI691dSBNc7xtdddeB9dDcQBjdlDzcrcIAkAXt7dKAvDj9XcPR3crRPcIBvdac/cw9q9wiA8I8o9bBq849IdE9aBk8C9MAiR08xNq8c9jAFJ89s88Ai87AS8fdEwK8q8s8a9MY69acG8m9ewW88jSB29NcKiu8e8lB%2B9B8SoR8tAx8J8p8Z858F9q9l9hBRBxAN9Rjt81BS9dAVdD8zALBDATp4DL8FEnROA79H9n8MRMA389hP8jtdgf8/8ACgCQDDQwCICYgrDUAYC8A4D4Blh6DUhHAMwOCghZhsCFg8CkgCC5EMh0CSDUhuCfiXiBBGCGg3AmhcDwSuhphQTWCaDoTxhOCmCvjyCJBniWcBDxtVcOBKcddRDOBxCmd/DPQZD8A1QTIOdFglDR8%2BcBdBhhdLCNcQBbCiSfdHCrBnCmjlDND9AdC9CDCjCpBTDtxzD8SoD7C6dOB6TeihCOBfARCuS5S%2BSGTSAu9kgHBJAgA)):

```asm
.LCPI0_3:
        ...
.LCPI0_4:
        ...
.LCPI0_5:
        ...
findCharsInSet:
        vgf2p8affineqb  ymm1, ymm0, qword ptr [rip + .LCPI0_3]{1to4}, 0
        vbroadcasti128  ymm2, xmmword ptr [rip + .LCPI0_4]
        vbroadcasti128  ymm3, xmmword ptr [rip + .LCPI0_5]
        vpshufb ymm0, ymm3, ymm0
        vpshufb ymm1, ymm2, ymm1
        vptestmb        k0, ymm0, ymm1
        kmovd   eax, k0
        vzeroupper
        ret
```

The advantage of this strategy over the one used by Langdale and Lemire ([2019](https://arxiv.org/pdf/1902.08318)) for [simdjson](https://github.com/simdjson/simdjson) is that we can reuse the vector containing the upper nibbles as a bit position (`1 << (c >> 4)`) if we want to do more *Vectorized Classification*. That means we can add more *Vectorized Classification* routines and only have to pay the cost for the lower nibbles, avoiding the need for an additional `vbroadcasti128+vpshufb` pair for the upper nibbles. To add another table, the additional overhead for Zen 3 is just `vbroadcasti128+vpshufb+vpand+vpcmpeqb+vpmovmskb`. For Zen 4, it's just `vbroadcasti128+vpshufb+vptestmb+kmovd`.

Dare I say this is...

<div alt="Blazingly Fast" class="blazingly-fast">

</div>

‒ Validark

:::note[Note from [Geoff Langdale](https://www.linkedin.com/feed/update/urn:li:activity:7246181875826733058?commentUrn=urn%3Ali%3Acomment%3A%28activity%3A7246181875826733058%2C7246455526627147776%29&dashCommentUrn=urn%3Ali%3Afsd_comment%3A%287246455526627147776%2Curn%3Ali%3Aactivity%3A7246181875826733058%29):]
<span style="font-size: smaller; line-height: 0">The [simdjson](https://github.com/simdjson/simdjson) PSHUFB lookup is essentially borrowed from [Hyperscan](https://github.com/intel/hyperscan/)'s own [shufti](https://github.com/intel/hyperscan/blob/master/src/nfa/shufti.c)/Teddy ([shufti](https://github.com/intel/hyperscan/blob/master/src/nfa/shufti.c) is a acceleration technique for NFA/DFA execution, while Teddy is a full-on string matcher, but both use similar techniques). The code in question is in https://github.com/intel/hyperscan/blob/master/src/nfa/shufti.c and https://github.com/intel/hyperscan/blob/master/src/nfa/truffle.c albeit kind of difficult to read (since there's a lot of extra magic for all the various platforms etc). Shufti is a 2-PSHUFB thing that is used "usually", truffle is "this will always work" and uses a technique kind of similar to yours (albeit for different reasons).</span>
:::
