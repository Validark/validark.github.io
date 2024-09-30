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

For the new version of my SIMD Zig parser being released on October 10, I came up with a slightly better technique for *Vectorized Classification* than the one used by Langdale and Lemire ([2019](https://arxiv.org/pdf/1902.08318)) for [simdjson](https://github.com/simdjson/simdjson), in that it stacks slightly better.

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
This takes the upper nibble, and then shifts `1` left by that amount. This allows us to store up to 8 valid upper nibbles (corresponding to the number of bits in a byte), in the range <span style="white-space: nowrap">$\footnotesize [0, 7]$.</span> This isn't quite <span style="whitespace: nowrap">$\footnotesize [0, 15]$,</span> the actual range of a nibble (4 bits), but for our use-case, we only are matching ascii characters, so this limitation does not affect us. Then we just have to do the same transform `1 << (c >> 4)` on the data in `chunk` and do a bitwise `&` to test if the upper nibble we found matches one of the valid options.

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

Luckily, there is a very easy way to map nibbles to a byte. Use `vpshufb` again!

```zig
comptime var powers_of_2_up_to_128: [16]u8 = undefined;
inline for (&powers_of_2_up_to_128, 0..) |*slot, i| slot.* = if (i < 8) @as(u8, 1) << i else 0;

const upper_nibbles_as_bit_pos = vpshufb(powers_of_2_up_to_128, chunk >> @splat(4));
```

Much better! ([Godbolt link](https://zig.godbolt.org/#z:OYLghAFBqd5QCxAYwPYBMCmBRdBLAF1QCcAaPECAMzwBtMA7AQwFtMQByARg9KtQYEAysib0QXACx8BBAKoBnTAAUAHpwAMvAFYgAzKVpMGoAF55gpJfWQE8Ayo3QBhVLQCuLBiABMpJwAyeAyYAHKeAEaYxPoAbKQADqgKhPYMrh5evonJqQJBIeEsUTF68daYtmlCBEzEBBme3n4VVQI1dQQFYZHRcVa19Y1ZLYNdwT3FfWUAlFao7sTI7BxoDAoEANQb6JsApHoAIpsAAngsSfUQez4%2BOzc%2BMwcAQnsaAIJrG5sR7nR2DH2R1O50uBGut1%2B/2CDyeeleHze7yogP4qAgyAQ7gYAGsQKcAGqVIjECB6PybdwADhmM1OABUAJ4JTAAeSoGKxuLpewA7Aj3pshZtiJgCItAScmAoICcmSz2ZzsTi5qcFAkjOCuLSgc4Ds5TgRiNjRARMEruS8kXzDtaPphVGDNijnahUD4LXjCcSSGSKdSdXLmWyOZjlTz%2BUjhZsvltahF6EDjmgLnY2K70TsAHQpFjoLOillMcEnFKmEOy%2BUVsPc1XZ3P5%2By1CDU0ibLixHl6PXdtUa4sQSS0uEC6Oi8XEQEANwSCixVAiEHj9DbNZxQOwB2wfc1g9pVsRvNtiI%2BLpnc/cC6XTAT7E2xkZBGDbeC%2BGWCnxQYVHOXmEDVcVX8I1HYU8CoTZZWCVxU3Oc0dT5EDoyFKc6hFTAFHcWgCE/ACOVfPB3y7Y5sSwGgQnQA9BSQoV%2BGICCNCzLMTgiQghDwctFS/Ct8MIukAHpNhpfZeWcPA%2BQNBCo2opDY02V8HSTOSGDfdC9gAVmeMS1NteEpOk4VRQwrD1M09TjgOY4wIg%2BTVA3CzNg0VQqQ0OkNE2TBaCUTZfxMmz9h8NSIOY1j2IrLjAJvegdQEmkzMo/SbTtKjqPHCU0KMgh4uFRKT2SmMBG%2BNgCAQDAFEUjZjVsYTEKQh0zUnZ1JQeWhaCnFgsyc2IsyYKdVDUrgfCzWd5yzCIs36nwHllIlbF9WJpEpGk2xOGaSQgea2wDOkVp9UkNsWkc9Nq1R6tRJrbhatqOqpLqetUQbhsvUapp22bSXJTalu9N6/U%2BwNVt9D6Dqy6i6uiM7Tma1r2s6nMFCUPQhovKhRqzAaqRegHSQ7P7lqxiAcYO7b8cJgMQeEnSBSO1KGoUAB3QhMSC3Dr1veDIw%2BfTXrW/aAyTLc5PAjFUBg9Ns3pOpgDFa6uqoTBi0WTAhDFAAJaUIChLDgizZAEncLM5YVwy2263qJoiOmdSKkr0AUJioau2G7ompGRrGiapt/F9lII9C6Q8ryThTBI6BwYhiF9B5nGUORvMlsVNiMZAcTKjCEidWjNnPecIg9245iO6NucB/0hIsgWrOF0XMG2Ah8wl4gpYIGWDflicldV9XNYBHW9dbo30JNu7Hjpa3Svti7oZb4fXaeiJPcizBvZUhR/c8mug5FkP6GwcPI9uaPY8GJvE6YZPU/cdOSC2TPs8vCIAtiWFSEL4Vi%2Bx%2BIDv5vRt0r4O0xruLeOzdYaG3bsrAgasZTd21rrfWYDFYKBNvDBGVsxQ2zticB2MMbpwwRrPFGY10YL1vMvX2q93Lr1OMHUOu8I6kijjHOOjcE5JxTtsS%2BGcSBZ0eguYh%2BcX6c2kgHGu5cf7UK3rQvepJsxUBYM3f%2BsFlDEGCOCB4ABJBgKFaB4F2JLTwjA4zBk2AkaUShdhEB4cjCI%2BJJJHnUs4BgDwTYIXCj%2BReTwjy0kEXlRKulDyHA4HMWgnA1K8G8NwXgqBOAAC0LDbAWEsURPg9B6F4NhDgWhvEIHllgGIEA5h4jUgxLgVIfAaF5KkvQXBeRcDUpIAwISOCSF4CwCQGgNCkAiVoUg0SOC8A/J0jJWTSBwFgEgGh9AyAUCrtvPopgNBcD0J0mgWFogfg1poXgLFmDEEZJwHgpAdl1EZKyCI2hiQHN4CmNgghWQMFoPszJvAsC/GAM4MQnkrmkCwCwYwwBxDPJ%2BXgUUVQpzoS2f4VQlR3Bmm%2BaojykKdERGICc1wWBIVGnON88FxAIjJEwIcTAfyTA6JMFsuYVAjDAAUASPAmA6ashZBEw5/BBAiDEOwKQMhBCKBUOoIFuguCGH%2BSAcwlhkUfkgHMVACQ7AFU4AAWlZJsAASh5eWSgABi0otiKuPgnTqAB9eaiqyXuFsoqlgcCLKmC0dENJvTcUqKwFKgpVgNVtG8BAJwwxvDCsCBMIoJQJA5BSPK9IbgmihqSOGtI3Rg19GFa0CNHQhhRqyMmz1qaxgJt6DEZNYw/Who2J0PNUwC1zAUIk5Y%2BhgmhPCZCvpmxxUOTRojNyEBcCEG4TcVJMx0kUrmDkpgeTKCFJAJIAAnFmKkNSp0%2BFiEuspVJJBqSpGpQwnAWmkDaVwDpXSm2cAGSAIZQ6t0cB8I2oFfTB3PO8bilIDhJBAA%3D%3D%3D))

```asm
.LCPI0_0:
        .zero   32,15
        .zero   32,1
.LCPI0_2:
        .byte   1
foo2:
        vpsrlw  ymm0, ymm0, 4
        vpand   ymm0, ymm0, ymmword ptr [rip + .LCPI0_0]
        vpbroadcastb    ymm1, byte ptr [rip + .LCPI0_2]
        vpshufb ymm0, ymm1, ymm0
        ret
```

Now we simply bitwise `&` the two together, and check if it is non-0 on AVX-512 targets, else we check it for equality against the `upper_nibbles_as_bit_pos` bitstring. I wrote a helper function for this:

```zig
fn vptest(a: anytype, b: anytype) std.meta.Int(.unsigned, @typeInfo(@TypeOf(a, b)).vector.len) {
	assert(std.simd.countTrues(@popCount(a) == @as(@TypeOf(a, b), @splat(1))) == @typeInfo(@TypeOf(a, b)).vector.len);

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
inline for (&powers_of_2_up_to_128, 0..) |*slot, i| slot.* = if (i < 8) @as(u8, 1) << i else 0;

const upper_nibbles_as_bit_pos = vpshufb(powers_of_2_up_to_128, chunk >> @splat(4));
const symbol_mask = vptest(upper_nibbles_as_bit_pos, vpshufb(table, chunk));
```

Compiled for Zen 3, we get ([Godbolt link](https://zig.godbolt.org/#z:OYLghAFBqd5QCxAYwPYBMCmBRdBLAF1QCcAaPECAMzwBtMA7AQwFtMQByARg9KtQYEAysib0QXACx8BBAKoBnTAAUAHpwAMvAFYgAzKVpMGoAF55gpJfWQE8Ayo3QBhVLQCuLBiEldSTgBk8BkwAOU8AI0xiEAA2UgAHVAVCewZXDy8fPySUuwEgkPCWKJj460xbNKECJmICDM9vXytMG3yGGrqCQrDI6LirWvrGrJaFYZ7gvpKB2IBKK1R3YmR2DjQGCYBqCfRtgFI9ABFtgAE8FiT6iAOAJju9%2B7v5o4AhA40AQU2diPc6HYGIcTudLtcCLcHv9AcFnq89B9vr8CNsmAolPUQac9gA6LD/YC49GYgjvT5fCko7ZCOQAcTp2CEABVsMcAPoANWwznZQgAkgAtbDY3YEdC4lIsCUKdzAYCYCacypEYgBRjAAgIABiJGcCXcEHcAA5SNsYbQgbjkAaEUifgIds4EO4GABrUVnZW2EgQWkMpmsjnc3kC4W4o7as0mu0UimYVQQ7ZUYE0BguBB1BT8zqYSHIF3ukDnb2qiB6O7R43zeZiiVsWq4nOQ3GulLAELoM1nAgATwSmBz/AgZ2Z/cwAHkqBAC663TXcQA3FUkXH0Bi1g4Adnt2z322pKRM9HZBbq7NQCQUooOAFY3uy78cTdu3tswBwAH4fs0f8C8d8OHeH9ALvN4QI/J8IKAvRtWgiBoPmaDX2Qrdjmg0gP0ONDyW%2BfcD1QK47DYbZFzqbZaFQVA3XcBJ2VqCJxBLFdiAgLh4m2GNPQUBIjEhDRYzw/dgloaZkxIbYICPYATzPYgLyvTct2cZBt2cCiqJouiGPoMDkEOO5Ym2DRVG1J9sOcI5Ti4EFLL0dSZxBbAjhFSRBK%2BfC0CIy5MFI8ikgAd2iBQLyodk7nZWj6NQdkuDuY1izA9inxNUVXSwNNMHQXCPOEhhRJCcTiEk%2B5YkC4LQvCyLtJiuLTWM3FcSU5wACoFEoggzTwNTdg63EWtFPAqEkvBbO2atznRI16q4Td7KOdTRraJRjJyilPMdVFaIHeSGDwCJGMVdl0XZCJCHZXJRUXK8XSoCIIHK4gQtQMKIqiohYvis1Z3dJyXPOHi%2BIgNz3I2rZUQUXsSjcdkWHRD0rNIhICEVSFtuidk9oO%2BgQpOs6CAu5IzWuhRbvuyjqPephDu%2Bwt51B/diDzFZgUh6HaFh%2BG1pw74KRTJGUYmCAmGLYxez7AczQiUWGHF8dazxBsmCbQQIFbLYLE7bsJcHBhh1Hccp2FqWF2XH1iDXRglPtT4AE4SWiSE8SlCU0FdAhmWIdxFRHJIElcd3hbm45EbOKaDYHI2mBN7tAaYSFZprbFQ51odUBHMdI%2BnaPzVNljLY3NbeY0W2mYIFnznx5x0UhIbJK85GfLrXFmTqBUCFxVRjViXEqEweOVkwIQ8wACSmi0rRtdxe/78umYUM1iUXVRbziiIAprOMS7tsOFAzw3s5jgHePjiABNrMAwER4WDKMiJXmL23lswLfbbtphk9BG/Stz9ztxD4uXx%2BYkzJhAHS7A0Syx1l1dMeA1gKBlnLActY64jhSKYSc04I6YIgMEfA8Ck7/TOOgnB2CjbgJrLWMh048FwMVLWZ%2B5xM44IodhXcwlhojmCK4bybAICEJ3OtfC%2B4yLFXnu4S0xZqG4NgQQtK6ZMCZWyoiIRwiiqSQ0I1M4%2BMhB4AwUbaRtCCG1gAPTjWat1ZSbDVFqP3NSPBCZBqyMVGBbqt4Q4qKErYxmioJFknvG404iNUEONUH9UEJljQCWMtsRh4DXEKLCfcW8kltGEF0forBzDyHU3oEnMx1Ynw5W8f/LeuU1FlwruIy0xT9ylMAfhVBxC9GkOyTQ5xChCF6BFM0zJ%2B8s5gNyZgSh1ivHCMqcQYEID3B3SkuKSUlwJRMwHKfXprSD4yPwfQxY2wKEwK2Z02pe56mUjGU0khBi2mDMOl0kU/pGQsjZFyHkfIhTYAjLBa2Nj8KiO2AkboCDDj3jWZcjZFDTE0npA8oMzzQxvI%2BWZdxXoWJ%2BihYGJ5IZXnhkjFWYOnEFFKKOcIkSYl%2BDFShGVAFZpNFNQsm1DqXUeqvm%2BbY9qqAO4DURtM2ZztFm4gTAQYgTBbDXPoF1bYA17nouDC8sM7ycWQoDI8mVcLsWfLNLy6U/LVCCuFbXDp4rJVouVbCrF8rYJmilSazFcqEWb08eU4RJzvETOBGkhoNcHoAoZscnmpzHXUgbAgDA15EYTC9rYUZjr8ICuiKmN1zxaC0EXCwTu3cl4rziriG6MzcQRFxKvO4zwRyll9LEaQnFqzdlLaxctuKqE1ogHWytPrhGxsmcmBNDwk0prTT3Jgy87jZtJrmiIxbkXm3LJWFt1aUUVnrcxSd86W1EpjTquNnbziJuTamruPcMRKD0MO26ebcR1XHY29iuLZ2TqvS2htKK70xiJaUh1NjXW7ACoQAsqSrngqjd4idZZm1cSsv9VBDdiK%2BTxK3Yg7c%2B0zwHkzYeBAx57wnsEa0BpENz0VIvAdma7jryTkGkNuIzjbt7XujNhbj2joLXFYt4D9l0M6bE2gK0zgNzoDgYgxBfTPGcMoOQuy255gosKt015ZQJCTGSpGI67qFvhKQFle4gO%2BmXaBk44HOGQabjBsTHdqN9yQ0PUe48ASWkw1PHDg8F7bAzS8WspH0AKHI5R3d6aCNDpzVQPNTGhksbkYwrjhEEg8ewHxgTDwhMieGO3CTyApO7G2iQVE8nuURDuLeWIKm1OLrLE%2BiaYHunbAg%2BFqDzdYPwZM7PQeKG0MQAwwwLD09TO4Yc5KDEmA9AkbzMGtzHnu07oQwe3rdH/P5vPQ8UVmBgv0PY5x7j9Aov8dYoJ4Tom4PiaMMl6TaWsSZb8xEGbLxVNjJjRx3ypWekrd4%2BtuZEoqAsA7vptgyhiDBEhM8HMZFRL7Dbp4RgqIdZ/IdvsIgCmyaJUEThW8zgGDPEXq%2BaRFD/41gu4619Ns0IcEWLQTgt5eDeG4LwVAnBBQWF2MsVYN27h6D0LwAgmh8eLAQP3LAMR%2BGkDdHEI9khcu2y4FuDQGhjS3geHcPwhOOCSF4CwCQYvSCk60KQCnHBeAII0KQFnHAtCLDgLAGAiAUDhZ42QCgM5zf0BiKYQVc4%2BCAmCpQaW%2BveBnWYMQXsnAeCkE93UXsE4IjaBVL73gXk2CCAnPlH37vSAEjlNXJNCCycJ8wHDY86w1f4CZlUZcqe1cJkqO4FG4fyCCDaKzww%2B0hXe9cFgavgrLjl%2BXMQCIyRMDHAz8YGSwRQDu8WFQIwwAFCcjwJgAKE4Byk79/wQQIgxDsCkDIQQigVDqHj7oSsRgTAgHMJYUSEQEGQEWJeDoqeAC0E5tgACU2j9yUNqGu2xL8JfE3u9k5bL8FXcGEy/LAU8VkpgDAbeTO6ubeX2WAJ%2BPOFQVQDgEATgow3gXAOugQ0wxQpQEgiQyQqQAgyBSuOBeQaQvQmBAwfgcBHQXQIwbgTQhBlB1QkwpB/QMQFBkwBBqBQw3QzBswrBiwCgtOaw%2BgBOROJO1eGu2wB%2BuyXsv0EAuAhAEk9wjO8wzOrOmOHOTAXOlAiwfOegPct4kgeg4udwtswukgW4Fhts8Qsu8upAiut4Ouqu5OnAWuIAOueuBupARupu92lulAvh%2B%2BDu7oTuloLuzW1eAe3u5ekRQeIeYeaekeIOMetAceOemAhIyeHG5eWAmeMk2evAueKoeABe1exeyApe6wfu32Ve8eR%2BdevYDe%2BRuuX2iuaebeHeSg3euRBUA%2Bnhw%2BTAo%2B4%2Bk%2B0%2BjA5e8%2Bwgog4gK%2B4x6%2Bag1eugMuve%2B%2BFgNex%2B8AZ%2BjcjonA1%2Bd%2BD%2B6ImAz%2BOwb%2BRm2wn%2B3%2Bv%2B/%2BgBBowBoB0QthqAkBeA0B6xrQ7QaQjg6YHBlY6BRQLBIAt4BguQeB6QtBWQcURBwJPBWBAJrxRRAg1BDQoJKBlYDB8JTBGBfxMJEw3QXxXB9QUJAwAJ/Bgh7AfWhgohKu4hnAkh1OQRHoch%2BAqoBkyhqhg%2B7OnOAwPONhCu/xjhVJmuVgbhuuahOh%2Bg%2BhhhxhphUgFhW4Vh5JHA4BTh6uLhwpbJ8pdwYh8eGurJBuiwbeKQDgkgQAA%3D)):

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
        .byte   0
        .byte   0
        .byte   0
        .byte   0
        .byte   0
        .byte   0
        .byte   0
        .byte   0
        .byte   4
        .byte   4
        .byte   8
        .byte   168
        .byte   4
        .byte   160
        .byte   128
        .byte   8
.LCPI0_4:
        .byte   1
        .byte   2
        .byte   4
        .byte   8
        .byte   16
        .byte   32
        .byte   64
        .byte   128
        .byte   0
        .byte   0
        .byte   0
        .byte   0
        .byte   0
        .byte   0
        .byte   0
        .byte   0
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


Compiled for Zen 4, we get ([Godbolt link](https://zig.godbolt.org/#z:OYLghAFBqd5QCxAYwPYBMCmBRdBLAF1QCcAaPECAMzwBtMA7AQwFtMQByARg9KtQYEAysib0QXACx8BBAKoBnTAAUAHpwAMvAFYgAzKVpMGoAF55gpJfWQE8Ayo3QBhVLQCuLBiEldSTgBk8BkwAOU8AI0xiEAA2UgAHVAVCewZXDy8fPySUuwEgkPCWKJj460xbNKECJmICDM9vXytMG3yGGrqCQrDI6LirWvrGrJaFYZ7gvpKB2IBKK1R3YmR2DjQGCYBqCfRtgFI9ABFtgAE8FiT6iAOAJju9%2B7v5o4AhA40AQU2diPc6HYGIcTudLtcCLcHv9AcFnq89B9vr8CNsmAolPUQac9gA6LD/YC49GYgjvT5fCko7ZCOQAcTp2CEABVsMcAPoANWwznZQgAkgAtbDY3YEdC4lIsCUKdzAYCYCacypEYgBRjAAgIABiJGcCXcEHcAA5SNsYbQgbjkAaEUifgIds4EO4GABrUVnZW2EgQWkMpmsjnc3kC4W4o7as0mu0UimYVQQ7ZUYE0BguBB1BT8zqYSHIF3ukDnb2qiB6O7R43zeZiiVsWq4nOQ3GulLAELoM1nAgATwSmBz/AgZ2Z/cwAHkqBAC663TXcQA3FUkXH0Bi1g4Adnt2z322pKRM9HZBbq7NQCQUooOAFY3uy78cTdu3tswBwAH4fs0f8C8d8OHeH9ALvN4QI/J8IKAvRtWgiBoPmaDX2Qrdjmg0gP0ONDyW%2BfcD1QK47DYbZFzqbZaFQVA3XcBJ2VqCJxBLFdiAgLh4m2GNPQUBIjEhDRYzw/dgloaZkxIbYICPYATzPYgLyvTct2cZBt2cCiqJouiGPoMDkEOO5Ym2DRVG1J9sOcI5Ti4EFLL0dSZxBbAjhFSRBK%2BfC0CIy5MFI8ikgAd2iBQLyodk7nZWj6NQdkuDuY1izA9inxNUVXSwNNMHQXCPOEhhRJCcTiEk%2B5YkC4LQvCyLtJiuLTWM3FcSU5wACoFEoggzTwNTdg63EWtFPAqEkvBbO2atznRI16q4Td7KOdTRraJRjJyilPMdVFaIHeSGDwCJGMVdl0XZCJCHZXJRUXK8XSoCIIHK4gQtQMKIqiohYvis1Z3dJyXPOHi%2BIgNz3I2rZUQUXsSjcdkWHRD0rNIhICEVSFtuidk9oO%2BgQpOs6CAu5IzWuhRbvuyjqPephDu%2Bwt51B/diDzFZgUh6HaFh%2BG1pw74KRTJGUYmCAmGLYxez7AczQiUWGHF8dazxBsmCbQQIFbLYLE7bsJcHBhh1Hccp2FqWF2XH1iDXRglPtT4AE4SWiSE8SlCU0FdAhmWIdxFRHJIElcd3hbm45EbOKaDYHI2mBN7tAaYSFZprbFQ51odUBHMdI%2BnaPzVNljLY3NbeY0W2mYIFnznx5x0UhIbJK85GfLrXFmTqBUCFxVRjViXEqEweOVkwIQ8wACSmi0rRtdxe/78umYUM1iUXVRbziiIAprOMS7tsOFAzw3s5jgHePjiABNrMAwER4WDKMiJXmL23lswLfbbtphk9BG/Stz9ztxD4uXx%2BYkzJhAHS7A0Syx1l1dMeA1gKBlnLActY64jhSKYSc04I6YIgMEfA8Ck7/TOOgnB2CjbgJrLWMh048FwMVLWZ%2B5xM44IodhXcwlhojmCK4bybAICEJ3OtfC%2B4yLFXnu4S0xZqG4NgQQtK6ZMCZWyoiIRwiiqSQ0I1M4%2BMhB4AwUbaRtCCG1gAPTjWat1ZSbDVFqP3NSPBCZBqyMVGBbqt4Q4qKErYxmioJFknvG404iNUEONUH9UEJljQCWMtsRh4DXEKLCfcW8kltGEF0forBzDyHU3oEnMx1Ynw5W8f/LeuU1FlwruIy0xT9ylMAfhVBxC9GkOyTQ5xChCF6BFM0zJ%2B8s5gNyZgSh1ivHCMqcQYEID3B3SkuKSUlwJRMwHKfXprSD4yPwfQxY2wKEwK2Z02pe56mUjGU0khBi2mDMOl0kU/pGQsjZFyHkfIhTYAjLBa2Nj8KiO2AkboCDDj3jWZcjZFDTE0npA8oMzzQxvI%2BWZdxXoWJ%2BihYGJ5IZXnhkjFWYOnEFFKKOcIkSYl%2BDFShGVAFZpNFNQsm1DqXUeqvm%2BbY9qqAO4DURtM2ZztFm4gTAQYgTBbDXPoF1bYA17nouDC8sM7ycWQoDI8mVcLsWfLNLy6U/LVCCuFbXDp4rJVouVbCrF8rYJmilSazFcqEWb08eU4RJzvETOBGkhoNcHoAoZscnmpzHXUgbAgDA15EYTC9rYUZjr8ICuiKmN1zxaC0EXCwTu3cl4rziriG6MzcQRFxKvO4zwRyll9LEaQnFqzdlLaxctuKqE1ogHWytPrhGxsmcmBNDwk0prTT3Jgy87jZtJrmiIxbkXm3LJWFt1aUUVnrcxSd86W1EpjTquNnbziJuTamruPcMRKD0MO26ebcR1XHY29iuLZ2TqvS2htKK70xiJaUh1NjXW7ACoQAsqSrngqjd4idZZm1cSsv9VBDdiK%2BTxK3Yg7c%2B0zwHkzYeBAx57wnsEa0BpENz0VIvAdma7jryTkGkNuIzjbt7XujNhbj2joLXFYt4D9l0M6bE2gK0zgNzoDgYgxBfTPGcMoOQuy255gosKt015ZQJCTGSpGI67qFvhKQFle4gO%2BmXaBk44HOGQabjBsTHdqN9yQ0PUe48ASWkw1PHDg8F7bAzS8WspH0AKHI5R3d6aCNDpzVQPNTGhksbkYwrjhEEg8ewHxgTDwhMieGO3CTyApO7G2iQVE8nuURDuLeWIKm1OLrLE%2BiaYHunbAg%2BFqDzdYPwZM7PQeKG0MQAwwwLD09TO4Yc5KDEmA9AkbzMGtzHnu07oQwe3rdH/P5vPQ8UVmBgv0PY5x7j9Aov8dYoJ4Tom4PiaMMl6TaWsSZb8xEGbLxVNjJjRx3ypWekrd4%2BtuZEoqAsA7vptgyhiDBEhM8HMZFRL7Dbp4RgqIdZ/IdvsIgCmyaJUEThW8zgGDPEXq%2BaRFD/41gu4619Ns0IcEWLQTgt5eDeG4LwVAnBBQWF2MsVYN27h6D0LwAgmh8eLAQP3LAMR%2BGkDdHEI9khcu2y4FuDQGhjS3geHcPwhOOCSF4CwCQYvSCk60KQCnHBeAII0KQFnHAtCLDgLAGAiAUDhZ42QCgM5zf0BiKYQVc4%2BCAmCpQaW%2BveBnWYMQXsnAeCkE93UXsE4IjaBVL73gXk2CCAnPlH37vSAEjlNXJNCCycJ8wHDY86w1f4CZlUZcqe1cJkqO4FG4fyCCDaKzww%2B0hXe9cFgavgrLjl%2BXMQCIyRMDHAz8YGSwRQDu8WFQIwwAFCcjwJgAKE4Byk79/wQQIgxDsCkDIQQigVDqHj7oSsRgTAgHMJYUSEQEGQEWJeDoqeAC0E5tgACU2j9yUNqGu2xL8JfE3u9k5bL8FXcGEy/LAU8VkpgDAbeTO6ubeX2WAJ%2BPOFQVQDgEATgow3gXAOugQ0wxQpQEgiQyQqQAgyBSuOBeQaQvQmBAwfgcBHQXQIwbgTQhBlB1QkwpB/QMQFBkwBBqBQw3QzBswrBiwCgtOaw%2BgBOROJO1eGu2wB%2BuyXsv0EAuAhAEk9wjO8wzOrOmOHOTAXOlAiwfOegPct4kgeg4udwtswukgW4Fhts8Qsu8upAiut4Ouqu5OnAWuIAOueuBupARupu92lulAvh%2B%2BDu7oTuloLuzW1eAe3u5ekRQeIeYeaekeIOMetAceOemAhIyeHG5eWAmeMk2evAueKoeABe1exeyApe6wfu32Ve8eR%2BdevYDe%2BRuuX2iuaebeHeSg3euRBUA%2Bnhw%2BTAo%2B4%2Bk%2B0%2BjA5e8%2Bwgog4gK%2B4x6%2Bag1eugMuve%2B%2BFgNex%2B8AZ%2BjcjonA1%2Bd%2BD%2B6ImAz%2BOwb%2BRm2wn%2B3%2Bv%2B/%2BgBBowBoB0QthqAkBeA0B6xrQ7QaQjg6YHBlY6BRQLBIAt4BguQeB6QtBWQcURBwJPBWBAJrxRRAg1BDQoJKBlYDB8JTBGBfxMJEw3QXxXB9QUJAwAJ/Bgh7AfWhgohKu4hnAkh1OQRHoch%2BAqoBkyhqhg%2B7OnOAwPONhCu/xjhVJmuVgbhuuahOh%2Bg%2BhhhxhphUgFhW4Vh5JHA4BTh6uLhwpbJ8pdwYh8eGurJBuiwbeKQDgkgQAA%3D)):

```asm
.LCPI0_3:
        .byte   0
        .byte   0
        .byte   0
        .byte   0
        .byte   128
        .byte   64
        .byte   32
        .byte   16
.LCPI0_4:
        .byte   1
        .byte   2
        .byte   4
        .byte   8
        .byte   16
        .byte   32
        .byte   64
        .byte   128
        .byte   0
        .byte   0
        .byte   0
        .byte   0
        .byte   0
        .byte   0
        .byte   0
        .byte   0
.LCPI0_5:
        .byte   0
        .byte   0
        .byte   0
        .byte   0
        .byte   0
        .byte   0
        .byte   0
        .byte   0
        .byte   4
        .byte   4
        .byte   8
        .byte   168
        .byte   4
        .byte   160
        .byte   128
        .byte   8
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

The advantage of this strategy over the one used by Langdale and Lemire ([2019](https://arxiv.org/pdf/1902.08318)) for [simdjson](https://github.com/simdjson/simdjson) is that we can reuse the vector containing the upper nibbles as a a bit position (`1 << (c >> 4)`) if we want to do more *Vectorized Classification*. That means we can add more *Vectorized Classification* routines and only have to pay the cost for the lower nibbles, avoiding the need for an additional `vbroadcasti128+vpshufb` pair for the upper nibbles. To add another table, the additional overhead for Zen 3 is just `vbroadcasti128+vpshufb+vpand+vpcmpeqb+vpmovmskb`. For Zen 4, it's just `vbroadcasti128+vpshufb+vptestmb+kmovd`.

Dare I say this is...

<div alt="Blazingly Fast" class="blazingly-fast">

</div>

‒ Validark

:::note[Note from [Geoff Langdale](https://www.linkedin.com/feed/update/urn:li:activity:7246181875826733058?commentUrn=urn%3Ali%3Acomment%3A%28activity%3A7246181875826733058%2C7246455526627147776%29&dashCommentUrn=urn%3Ali%3Afsd_comment%3A%287246455526627147776%2Curn%3Ali%3Aactivity%3A7246181875826733058%29):]
<span style="font-size: smaller; line-height: 0">The [simdjson](https://github.com/simdjson/simdjson) PSHUFB lookup is essentially borrowed from [Hyperscan](https://github.com/intel/hyperscan/)'s own [shufti](https://github.com/intel/hyperscan/blob/master/src/nfa/shufti.c)/Teddy ([shufti](https://github.com/intel/hyperscan/blob/master/src/nfa/shufti.c) is a acceleration technique for NFA/DFA execution, while Teddy is a full-on string matcher, but both use similar techniques). The code in question is in https://github.com/intel/hyperscan/blob/master/src/nfa/shufti.c and https://github.com/intel/hyperscan/blob/master/src/nfa/truffle.c albeit kind of difficult to read (since there's a lot of extra magic for all the various platforms etc). Shufti is a 2-PSHUFB thing that is used "usually", truffle is "this will always work" and uses a technique kind of similar to yours (albeit for different reasons).</span>
:::
