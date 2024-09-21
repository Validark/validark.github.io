---
title: Eliminating Shifted Geometric Recursion
published: 2024-09-21T09:00:00
description: 'How to eliminate a shifted geometric math loop using an approximation method'
image: ''
tags: ['math', 'branch-elimination']
category: ''
draft: false
language: 'en-us'
---

A while back, I noticed [this code](https://github.com/ziglang/zig/blob/91b4729962ddec96d1ee60d742326da828dae94a/lib/std/array_list.zig#L374-L377) in Zig's [ArrayList.ensureTotalCapacity](https://ziglang.org/documentation/master/std/#std.array_list.ArrayListAlignedUnmanaged.ensureTotalCapacity):

```zig
var better_capacity = self.capacity;
while (true) {
    better_capacity +|= better_capacity / 2 + 8;
    if (better_capacity >= new_capacity) break;
}
```

In assembly:

```asm
ensureTotalCapacity:
        mov     rcx, -1
        mov     rax, rdi
.LBB0_1:
        mov     rdx, rax
        shr     rdx
        add     rdx, 8
        add     rax, rdx
        cmovb   rax, rcx
        cmp     rax, rsi
        jb      .LBB0_1
        ret
```

Just for fun, in this article I will investigate replacing this with a branchless approximation.

First, I will temporarily disregard the fact that we are dealing with 64 bit integers, disregard the fact that doing an integer division by 2 can floor the true quotient by 0.5 when the dividend is odd, and disregard the saturating arithmetic and just write this in terms of a recursive sequence.


$$
\LARGE
\begin{equation}
\begin{split}
      U_0 &= \texttt{capacity}\\
      U_n &= U_{n-1} \times 1.5  + 8\\
\end{split}
\end{equation}
$$


If you remember your pre-calculus class, this recursive sequence is called "shifted geometric", because it has a multiply that is being shifted by an addition. For <span style="white-space: nowrap">$\footnotesize U_0 = c$,</span> the expansion of this recursive sequence looks like:

$$
\LARGE
\begin{equation}
\begin{split}
      U_1 = c \times 1.5 + 8\\
      U_2 = (c \times 1.5 + 8) \times 1.5 + 8\\
      U_3 = ((c \times 1.5 + 8) \times 1.5 + 8) \times 1.5 + 8\\
      U_4 = (((c \times 1.5 + 8) \times 1.5 + 8) \times 1.5 + 8) \times 1.5 + 8\\
      U_5 = ((((c \times 1.5 + 8) \times 1.5 + 8) \times 1.5 + 8) \times 1.5 + 8) \times 1.5 + 8\\
\end{split}
\end{equation}
$$

To get the general equation, let's replace $\footnotesize 1.5$ with $\footnotesize r$ and $\footnotesize 8$ with <span style="white-space: nowrap">$\footnotesize d$:</span>

$$
\LARGE
\begin{equation}
\begin{split}
      U_0 = c \\
      U_1 = c \times r + d\\
      U_2 = (c \times r + d) \times r + d\\
      U_3 = ((c \times r + d) \times r + d) \times r + d\\
      U_4 = (((c \times r + d) \times r + d) \times r + d) \times r + d\\
      U_5 = ((((c \times r + d) \times r + d) \times r + d) \times r + d) \times r + d\\
\end{split}
\end{equation}
$$


Let's apply the distributive property of multiplication:

$$
\LARGE \begin{equation}
\begin{split}
      U_1 =cr^1    + dr^0\\
      U_2 = cr^2 + dr^1                                        + dr^0\\
      U_3 = cr^3 + dr^2 + dr^1                           + dr^0\\
      U_4 = cr^4 + dr^3 + dr^2 + dr^1              + dr^0\\
      U_5 = cr^5 + dr^4 + dr^3 + dr^2 + dr^1 + dr^0\\
\end{split}
\end{equation}
$$

The pattern here is pretty obvious. We can express it using $\footnotesize \Sigma$ notation:

$$
\LARGE U_n = cr^n + \sum_{i=1}^{n} dr^{i-1}
$$

You may notice that the $\footnotesize \Sigma$ term is the "sum of a finite geometric sequence". Replacing that term with the well-known formula for that allows us to write an explicit function:

$$
\LARGE f(n) = cr^n + d \left(\frac{1 - r^n}{1 - r}\right)
$$

Let's put $\footnotesize 1.5$ back in for $\footnotesize r$ and $\footnotesize 8$ back in for $\footnotesize d$ and assess the damage:

$$
\LARGE f(n) = c \times 1.5^n + 8 \left(\frac{1 - 1.5^n}{1 - 1.5}\right)
$$

Luckily, we can simplify $\footnotesize (1 - 1.5)$ to <span style="white-space: nowrap">$\footnotesize -0.5$.</span> Dividing by $\footnotesize -0.5$ is equivalent to multiplying by <span style="white-space: nowrap">$\footnotesize -2$,</span> which we can combine with the $\footnotesize 8$ term to get <span style="white-space: nowrap">$\footnotesize -16$:</span>

$$
\LARGE f(n) = c \times 1.5^n + -16 (1 - 1.5^n)
$$

We could stop here, but let's distribute the <span style="white-space: nowrap">$\footnotesize -16$:</span>

$$
\LARGE f(n) = c \times 1.5^n  - 16 + 16 \times 1.5^n
$$

Since we have two terms being added which each are multiplied by <span style="white-space: nowrap">$\footnotesize 1.5^n$,</span> we can factor it out like so:

$$
\LARGE f(n) = (c+16) \times 1.5^n - 16
$$

This looks how we probably expected it would, and it is relatively easy to deal with. Now let's try to apply this to our original problem. The first thing we want to do, is find an $\footnotesize n$ for which <span style="white-space: nowrap">$\footnotesize x \ge f(n)$,</span> where $\footnotesize x$ is the requested `new_capacity`. To find <span style="white-space: nowrap">$\footnotesize n$,</span> we have to isolate it on the right-hand side:

$$
\LARGE \begin{equation}
\begin{split}
      x &\ge (c+16) \times 1.5^n - 16          \\
  \small \texttt{(+16 to both sides)}       \\
      x + 16 &\ge (c+16) \times 1.5^n          \\
  \small \texttt{(divide by (c+16) on both sides)}   \\
      \frac{x + 16}{c+16} &\ge 1.5^n            \\
  \small \texttt{(take the log of both sides)}   \\
      \log{\left(\frac{x + 16}{c+16}\right)} &\ge \log{(1.5^n)}            \\
  \small \texttt{(property of logarithms on the right-hand side)}   \\
      \log{\left(\frac{x + 16}{c+16}\right)} &\ge n\log{(1.5)}            \\
  \small \texttt{(divide each side by log(1.5))}   \\
     \frac{ \log{\left(\frac{x + 16}{c+16}\right)}}{\log{(1.5)}} &\ge n            \\
  \small \texttt{(property of logarithms on the left-hand side)}   \\
     \log_{1.5}{\left(\frac{x + 16}{c+16}\right)} &\ge n            \\
       \small \texttt{(property of logarithms on the left-hand side)}   \\
     \log_{1.5}{(x + 16)} - \log_{1.5}{(c + 16)} &\ge n            \\
\end{split}
\end{equation}
$$

Now this is usable for our problem. We can compute $\footnotesize n$ by doing <span style="white-space: nowrap">$\footnotesize \lceil\log_{1.5}{(x + 16)} - \log_{1.5}{(c + 16)}\rceil$,</span> then plug that in to $\footnotesize n$ in <span style="white-space: nowrap">$\footnotesize f(n) = (c+16) \times 1.5^n - 16$.</span> Together, that's:

$$
\LARGE (c+16) \times 1.5^{\lceil(\log_{1.5}{(x + 16)} - \log_{1.5}{(c + 16)})\rceil} - 16
$$

For those of you who skipped ahead, $\footnotesize c$ is `self.capacity` and $\footnotesize x$ is `new_capacity`, and this formula gives you the `better_capacity`. Note that this formula will give numbers a bit higher than the original while loop, because the original while loop loses some 0.5's when dividing an odd number by 2.

-----------------------------------------------------------------------------

Now, the remaining question is how to compute the previous expression, or rather, an approximation of it, efficiently.

Sadly, efficiently computing the base $\footnotesize 1.5$ logarithm of an integer is not ideal. If we were allowed to change the original problem such that we could use the base $\footnotesize 2$ logarithm, that would be much easier to compute, that's just `@typeInfo(@TypeOf(c)).int.bits - 1 - @clz(c)` (obviously, this would be an integer, so we should be careful on how the flooring of the true answer affects rounding error). Let's use this information to make an approximation. Using the change of base property of logarithms, we can rewrite the equation like so:

$$
\LARGE \frac{\log_2{(x + 16)}}{\log_2{1.5}} - \frac{\log_2{(c + 16)}}{\log_2{1.5}}
$$

Equivalently:

$$
\LARGE (\log_2{(x + 16)} - \log_2{(c + 16)}) \times \frac{1}{\log_2{1.5}}
$$

<span style="white-space: nowrap">$\footnotesize \frac{1}{\log_2{1.5}} \approx 1.7095112913514547$,</span> so we can approximate the above expression like so:

$$
\LARGE (\log_2{(x + 16)} - \log_2{(c + 16)}) \times 1.7095112913514547
$$

As hinted to earlier, we can find $\footnotesize \lceil\log_2{(x + 16)}\rceil - \lceil\log_2{(c + 16)}\rceil$ by doing `@clz(c + 15) - @clz(x + 15)`. Note that the terms are now in reverse order because the answer returned by `@clz(b)` is actually <span style="white-space: nowrap">$\footnotesize 63 - \lfloor\log_2{b}\rfloor$.</span> We also subtracted $\footnotesize 1$ from $\footnotesize 16$ because we probably want the ceil base $\footnotesize 2$ logarithm instead, and the algorithm for that is `64 - @clz(x - 1)`. `(64 - @clz((x + 16) - 1)) - (64 - @clz((c + 16) - 1))` reduces to `@clz(c + 15) - @clz(x + 15)`. That's slightly different than what we want, which is to ceil only after multiplying by <span style="white-space: nowrap">$\footnotesize 1.7095112913514547$,</span> but if we're careful about which way the rounding works, we should be fine.

:::tip[Aside]

The other thing I notice is that $\footnotesize 1.5^{n}$ is equivalent to <span style="white-space: nowrap">$\footnotesize \frac{3^{n}}{2^{n}}$.</span> Of course, dividing by $\footnotesize 2^{n}$ is just a right shift, which means we could do the following once we determine the value of <span style="white-space: nowrap">$\footnotesize n$.</span>

$$
\LARGE (((c+16) \times 3^{n}) \gg n) - 16
$$

Of course, this will have additional overflow potential even when the right shift would have taken us back into the range of `usize`. Maybe we could expand to 128 bits for the multiply. Alternatively, for powers of 1.5 where the decimal point is less relevant, we'd probably be fine with a lookup table or something so our code could be `(c + 16) * powers[...]) - 16`

:::
One thing we could do is work backwards, changing $\footnotesize 1.7095112913514547$ to a nicer number like $\footnotesize 1.5$ or <span style="white-space: nowrap">$\footnotesize 2$.</span> Let's pick <span style="white-space: nowrap">$\footnotesize 2$.</span> To make it so we would multiply by $\footnotesize 2$ instead, we would change our recursive sequence to:

$$
\LARGE \begin{equation}
\begin{split}
      U_0 = \texttt{capacity}\\
      U_n = U_{n-1} \times \sqrt 2  + 8\\
\end{split}
\end{equation}
$$

This works because $\footnotesize \frac{1}{\log_2{\sqrt 2}}$ is <span style="white-space: nowrap">$\footnotesize 2$.</span> This is still pretty close to our original formula, as $\footnotesize \sqrt 2 \approx 1.41421$ and <span style="white-space: nowrap">$\footnotesize 1.41421 \approx 1.5$.</span> If we did the same steps as before, $\footnotesize \frac{8}{1 - \sqrt 2} \approx 19.313708498984756$ would be in all the places where we had $\footnotesize 16$ in our original equations. Let's round that up to $\footnotesize 20$ this time, since we rounded $\footnotesize 1.5$ down to <span style="white-space: nowrap">$\footnotesize \sqrt 2$.</span> To do that, we change the common difference of $\footnotesize 8$ to <span style="white-space: nowrap">$\footnotesize -20 (1 - \sqrt 2)$,</span> which is about <span style="white-space: nowrap">$\footnotesize 8.2842712474619$.</span> Reminder: the point here is that when we divide this value by <span style="white-space: nowrap">$\footnotesize (1 - \sqrt 2)$,</span> we get $\footnotesize -20$ rather than the $\footnotesize -16$ we had earlier.

$$
\LARGE \begin{equation}
\begin{split}
      U_0 &= \texttt{capacity}\\
      U_n &= U_{n-1} \times \sqrt 2 - 20 (1 - \sqrt 2)\\
      U_n &\approx U_{n-1} \times 1.41421 + 8.2842712474619\\
\end{split}
\end{equation}
$$

By the same steps shown above, this gives us the coveted:

$$
\LARGE (c+20) \times \sqrt 2^{\lceil 2(\log_2{(x + 20)} - \log_2{(c + 20)})\rceil} - 20
$$

I.e.:

$$
\LARGE (c+20) \times \sqrt 2^{\lceil \log_{\sqrt 2}{(x + 20)} - \log_{\sqrt 2}{(c + 20)}\rceil} - 20
$$

As mentioned before, we can find $\footnotesize \lceil\log_2{(x + 20)}\rceil - \lceil\log_2{(c + 20)}\rceil$ by doing `@clz(c + 19) - @clz(x + 19)`. However, this is not close enough to $\footnotesize \lceil \log_{\sqrt 2}{(x + 20)} - \log_{\sqrt 2}{(c + 20)}\rceil$ for our use-case because we need at least the granularity of a $\footnotesize \log_{\sqrt 2}{}$ either way (ideally, we could use even more precision in some cases). This could be accomplished via a lookup table, or via another approximation. As an approximation, we could pretend that each odd power of $\footnotesize \sqrt 2$ is half-way between powers of $\footnotesize 2$ that fall on even powers of <span style="white-space: nowrap">$\footnotesize \sqrt 2$.</span> If you think about it, this is kind of semantically in line with what we are doing when we subtract the `@clz` of two numbers, now with slightly more granularity. Here is how we could accomplish that:

<!-- By AND'ing the bit directly under the most significant bit with the most significant bit, then moving it to the 1's place, we can add it with double the bit index of the highest set bit: -->

```zig
// Basically @clz but with double the normal granularity
fn log_sqrt_2_int(x: u64) u64 {
    assert(x != 0);
    const fls = 63 - @as(u64, @clz(x));
    const is_bit_under_most_significant_bit_set = (x & (x << 1)) >> @intCast(fls);
    return (fls * 2) | is_bit_under_most_significant_bit_set;
}
```

This is kind of what we are looking for, with a bit more accuracy than before. We can also scale this up even more if desired:

```zig
// Kinda an approximation of 16 log2(x). Will be divided by 8 to approximate 2 log2(x).
export fn log_approx_helper(y: usize) usize {
    const COMPLEMENT = @typeInfo(usize).int.bits - 1;
    const BITS_TO_PRESERVE = @as(comptime_int, COMPLEMENT - @clz(@as(usize, 20)));

    const x = y +| 20;
    const fls: std.math.Log2Int(usize) = @intCast(COMPLEMENT - @clz(x)); // [4, 63]

    const pack_bits_under_old_msb = switch (builtin.cpu.arch) {
        // the `btc` instruction saves us a cycle on x86
        .x86, .x86_64 => (x ^ (@as(usize, 1) << fls)) >> (fls - BITS_TO_PRESERVE),
        else => @as(std.meta.Int(.unsigned, BITS_TO_PRESERVE), @truncate((x >> (fls - BITS_TO_PRESERVE)))),
    };
    return (@as(usize, fls) << BITS_TO_PRESERVE) | pack_bits_under_old_msb; // [16, 1023] on 64-bit
}

// usage:
const n = 1 + (log_approx_helper(x + 19) - log_approx_helper(c + 19)) / 8;
// i.e.:
const n = 1 + (log_approx_helper(new_capacity + 19) - log_approx_helper(self.capacity + 19)) / 8;
```

Now that we have calculated <span style="white-space: nowrap">$\footnotesize n$,</span> the last problem is approximating <span style="white-space: nowrap">$\footnotesize \sqrt 2^n$.</span> Again, this can be done with a lookup table, or we could pretend once more that odd powers of $\footnotesize \sqrt 2$ are directly in the middle of powers of <span style="white-space: nowrap">$\footnotesize 2$.</span> Let's try that.

```zig
fn approx_sqrt_2_pow(y: u7) u64 {
    // y is basically a fixed point integer, with the 1's place being after the decimal point
    const shift = @intCast(u6, y >> 1);
    return (@as(u64, 1) << shift) | (@as(u64, y & 1) << (shift -| 1));
}
```

And here are the estimates versus what we would get from `std.math.pow(f64, std.math.sqrt2, n)`:

```
pow: est vs double  <- format
√2^1: 1 vs 1.4142135623730951
√2^3: 3 vs 2.8284271247461907
√2^5: 6 vs 5.656854249492383
√2^7: 12 vs 11.313708498984768
√2^9: 24 vs 22.627416997969544
√2^11: 48 vs 45.254833995939094
√2^13: 96 vs 90.50966799187822
√2^15: 192 vs 181.01933598375646
√2^17: 384 vs 362.038671967513
√2^19: 768 vs 724.0773439350261
√2^21: 1536 vs 1448.1546878700526
√2^23: 3072 vs 2896.3093757401057
√2^25: 6144 vs 5792.618751480213
√2^27: 12288 vs 11585.237502960428
√2^29: 24576 vs 23170.475005920864
```

<details>
  <summary>More</summary>

  ```
  √2^31: 49152 vs 46340.950011841735
  √2^33: 98304 vs 92681.9000236835
  √2^35: 196608 vs 185363.80004736703
  √2^37: 393216 vs 370727.60009473417
  √2^39: 786432 vs 741455.2001894685
  √2^41: 1572864 vs 1482910.4003789374
  √2^43: 3145728 vs 2965820.800757875
  √2^45: 6291456 vs 5931641.601515752
  √2^47: 12582912 vs 11863283.203031506
  √2^49: 25165824 vs 23726566.406063017
  √2^51: 50331648 vs 47453132.81212604
  √2^53: 100663296 vs 94906265.62425211
  √2^55: 201326592 vs 189812531.24850425
  √2^57: 402653184 vs 379625062.4970086
  √2^59: 805306368 vs 759250124.9940174
  √2^61: 1610612736 vs 1518500249.9880352
  √2^63: 3221225472 vs 3037000499.976071
  √2^65: 6442450944 vs 6074000999.952143
  √2^67: 12884901888 vs 12148001999.904287
  √2^69: 25769803776 vs 24296003999.808582
  √2^71: 51539607552 vs 48592007999.61717
  √2^73: 103079215104 vs 97184015999.23438
  √2^75: 206158430208 vs 194368031998.46878
  √2^77: 412316860416 vs 388736063996.9377
  √2^79: 824633720832 vs 777472127993.8755
  √2^81: 1649267441664 vs 1554944255987.7512
  √2^83: 3298534883328 vs 3109888511975.503
  √2^85: 6597069766656 vs 6219777023951.008
  √2^87: 13194139533312 vs 12439554047902.018
  √2^89: 26388279066624 vs 24879108095804.043
  √2^91: 52776558133248 vs 49758216191608.09
  √2^93: 105553116266496 vs 99516432383216.22
  √2^95: 211106232532992 vs 199032864766432.47
  √2^97: 422212465065984 vs 398065729532865.06
  √2^99: 844424930131968 vs 796131459065730.2
  √2^101: 1688849860263936 vs 1592262918131461
  √2^103: 3377699720527872 vs 3184525836262922.5
  √2^105: 6755399441055744 vs 6369051672525847
  √2^107: 13510798882111488 vs 12738103345051696
  √2^109: 27021597764222976 vs 25476206690103400
  √2^111: 54043195528445952 vs 50952413380206810
  √2^113: 108086391056891904 vs 101904826760413630
  √2^115: 216172782113783808 vs 203809653520827300
  √2^117: 432345564227567616 vs 407619307041654700
  √2^119: 864691128455135232 vs 815238614083309600
  √2^121: 1729382256910270464 vs 1630477228166619600
  √2^123: 3458764513820540928 vs 3260954456333240000
  √2^125: 6917529027641081856 vs 6521908912666482000
  √2^127: 13835058055282163712 vs 13043817825332965000
  ```
</details>

With a little polishing, this is the code I ended up with:

```zig
const std = @import("std");

// Kinda an approximation of 16 log2(x). Will be divided by 8 to approximate 2 log2(x).
fn log_approx_helper(y: usize) usize {
    const COMPLEMENT = @typeInfo(usize).int.bits - 1;
    const BITS_TO_PRESERVE = @as(comptime_int, COMPLEMENT - @clz(@as(usize, 20)));

    const x = y +| 20;
    const fls: std.math.Log2Int(usize) = @intCast(COMPLEMENT - @clz(x)); // [4, 63]
    const pack_bits_under_old_msb: std.meta.Int(.unsigned, BITS_TO_PRESERVE) = @truncate(x >> (fls - BITS_TO_PRESERVE));
    return (@as(usize, fls) << BITS_TO_PRESERVE) | pack_bits_under_old_msb; // [16, 1023] on 64-bit
}

/// Modify the array so that it can hold at least `new_capacity` items.
/// Invalidates pointers if additional memory is needed.
export fn ensureTotalCapacity(capacity: usize, new_capacity: usize) usize {
    const power = 1 + (log_approx_helper(new_capacity) -| log_approx_helper(capacity)) / 8;
    const shift: std.math.Log2Int(usize) = @intCast(power >> 1);
    const approx_sqrt_2_power = (@as(usize, 1) << shift) | (@as(usize, power & 1) << (shift -| 1));
    return @max(capacity +| (capacity / 2 + 8), (capacity +| 20) *| approx_sqrt_2_power - 20);
}

// side note: I decided to just always use 20 instead of 19 where applicable, because it is a mostly trivial difference
// and we can reuse `capacity +| 20` in 2 locations.
```

Here is the [godbolt link](https://zig.godbolt.org/#z:OYLghAFBqd5QCxAYwPYBMCmBRdBLAF1QCcAaPECAMzwBtMA7AQwFtMQByARg9KtQYEAysib0QXACx8BBAKoBnTAAUAHpwAMvAFYgAzKVpMGoAF55gpJfWQE8Ayo3QBhVLQCuLBiABMpJwAyeAyYAHKeAEaYxL5cpAAOqAqE9gyuHl6%2BCUkpAkEh4SxRMT5x1pi2qUIETMQE6Z7efuWVAtW1BPlhkdGxVjV1DZnNA53B3UW9pQCUVqjuxMjsHGgMCgQA1OvoGwCkegAiGwACeCyJdRC7Pj7b1z7T%2BwBCuxoAgq9vAPRfGwDSwXQTA2xhB8XixFQqjOTDsAg2qCoGy4ADYNrRUMAfBBVNMAHQbADqdFoGyiG3wADc8FgdhEAJ4bAAcGyIYIhUJhBEwGx86Mx2NxeM%2BVAY/OAAH0mODIaoJQhMLR4tEIPSQBt3MlTJhphqtTzdgB2F7vDZmjardYbZwAeQAssoAtg7dhQgAVPaHE4EenKgCSDH4EE1eG1%2BOCBDxEUICg2AFpkc9PuaLQIrU8/W6hBK3TaJcoAErYITYAsANWwnqOxyYCggaHOdjYEojpGt9sdztdHoTx2QtFMEBrdZD2rbPg00ynSfeyfNls2qirG0Z1xehucvI0M7eKYXGyotAU6u2eJYsIQeICAoDBGD%2Bt1%2B2rEectbvtodTpd7vjJ37g9xR49CeDYfj2ABWJ5pA2FE9F2cCDjnM193iJhkAAawlaMCAUCV3AYLBiAlNx0AlFgFAiE8CHQM9MBqPFbwgPF8OSYAQnQNsMyzHM80LYtSwrR8vWOAhiHw0RuRxT1sH2StqCPX8uOzXN8yLEty2wadgKQjZiDohYxSHWt71DTA20PBQhOcfZNyUnjVP4jTHw3DZUIwrCYzwgjomI2hSPIiJnlA354KeVE2y4DQfDghCETFFFJDjbDPiNRDZ3eH5fjtDA8CoRkCAVEFiGIJhGQUVBWQQWENkIC1QQQEiQU2eg3z2FENBCAB3CVRDcwh6V2dqau5cjhQysCA0pMQaVhTBY0SCNoljXKQXQfA4WYUk2BYEhGTwWMQkwWkxreTBVAuTZRQ2RgFAWTA3VQGpaFfPqfXraU0P69VRzMjYup6j7kC%2BvVTN1H69mNHSUNQTromXLg9h8ECIAxSVpQ5OUFSVFV/t6z6fV1OMjU3VGpRlKF5UVZViHe176SnUDmR3Pc002BQEFyggqJo88CqvG9BBMsNl1OQRX3WCBElh4hpNk5EgJNXd51Z9lZQlBQAEc6glHwJSluGnw2IyR31CKrJsrYOaoAhnM3Y2hd%2B/WZeuNEuHNvQ7fZzn42J%2BWFZ0vSCAMk5z1UWn8dXJHffDoGfUZvk12ZWYjbx2PI/XTcJ11AAqX30bVzXtd1p3fyzndUo4WZaE4cDeG8bheFQTgAC0LC2eZFgNaK9F4LmOC0KdSAVJhCMoWZ0JASQNDxABOFEZ9RHwZ5n8DwJnyRDS4cDDE4SReBYCQNA0Uh660Ugm44Xhj2PvuB9IOBYBgKAn4gJAG3iOhonISh38/mJTFEvhdCfA6DcmIMeCAlF%2B68GjMwYgaoG6kFgbUekNoIjaAqH3HgpAGxsEEDaBgtAEFnywBEdwwBXy0CPJwbBWBzwmHENA0g%2BA9KVEpHNTQvAzoVHcNyGhvBFrVyYbQPAEQSrwNcFgThpBRJnH4aQdhxAIhJEwAcTA9DgAiJMJw2Yh4mDAAUGWPAmBOo2mVPXbB/BBAiDEOwKQMhBCKBUOoJhug4hGG0eYSwIiIjHkgLMVA8QNrHg4HGG0GwCyKkwLWTAAAxVqcYBjADohsVQTIUQSgSnGLR7glxxhYMgeI7gnymAYIove59FHEBpBw/xVgomtG8BAJwQxvBxECOMQoxQJDZGSBtVpPTEh9NSF0LpvQygNI2u0QYbhGg9JaFM0YoyegxDKKMAZayOjLMmKs2Y5UFhLH0FXGuddpEXw2F41kYkGDoSNrgQgJBEZ6D0NMXuOjZjD1HhAceIBwLHyERUg%2BfyT5nM4FfEAN8dH3xfkgIgbhv4QFqAYsFpAkUKGUMYRUQgGqdQsbwX%2B9BiChFYMsS5gCblcPWiQGk%2BgHHCFEOIexVj5BKDUNItxpAdrMDQPcogxAAAStYniYEYG8XhqAzGMCOvIrlaFUC8pIJKvFnKBByuqPgZV2xggoq1QwDFIRaDYphsquFtA/ToBAFQykLB8kSWucAzqJV4j8OORwWuIKmEXytTagpwIyX2ruVS523c2yuHOH/J5bs3nQMHp83o3yd4cEBb84%2Bp9G46ohTI95pAJ7AqET3D1Z8L7Rrvg/Z%2B8BX4oFQOGwlCKCW9AAfakBtAwEQKgWfZB8D5GdtQegzB8jcGMAIAQoh0jSHkModQxBdDjCaOWCQvArC7DsJCWfbhyBeHLGwYI6RPjxH0kkfO3u1SD6IMUcopQaiNFaNADGvgRgDFGJMUq%2BRzKbGMukMypxbLXFZA8WYCwhhRF%2BITYE4JnAwkRKiTE%2BJVpElIpSUwWoyAEBZJyXkgpRSnzo3oGRAtqAqk1JA3syZqRHAEQ2f4Ai2zulxCGbkNIszMh0ZyBtGj4z6k2EWR0SjCyqhLM6Ss%2BZ6ymNtP6FswTOyJB7I7ocl5ib3VpvPpwC5bdyW3IgAq4NzzXlZpjR86JXyfl5t3vvFNhb02XysJm2%2BldoUVthageFFBEXEGRaEzDxTDg4cwPkgtaL9VYpxUp%2BtRKSWcH9UAylDzqkWoMG%2BhldjP2yG/S4s%2Bug/Cyp5UGwVChhWivFUq6ViCsvyqDS%2Bkrqq0Dqu1Yg3VOrqLBEC4a4L8jTXmstbQa1trYRNtEiKmlx9HXShdQp05nrODep66p4AVygGBpi08gw1pq0f0JU8h4JbK4GZHvG11ybgVKeLdZyF%2Bmc3mfzeNotKLbOD1zTPPEGg9AaCZHoQ0R9JBT3Aj4JkiafBmciqm0FVnbuuv%2BxZ5TIPs2KOSA4SQQA). According to llvm-mca, on a Zen 4 system this `ensureTotalCapacity` function would take ~22 cycles to execute. The [Zen 4 optimization manual](https://www.amd.com/content/dam/amd/en/documents/processor-tech-docs/software-optimization-guides/57647.zip) says

> The branch misprediction penalty is in the range from 11 to 18 cycles, depending on the type of mispredicted branch and whether or not the instructions are being fed from the Op Cache. The common case penalty is 13 cycles.

That means if we expect our original loop to run for at least 10 cycles, plus a branch mispredict penalty, this approximation would be faster (while reducing the overall pressure on the branch predictor). I'm not sure we actually expect this loop to branch backwards anyway, but if we did, this could be a good alternative.


Before:

```asm
ensureTotalCapacity:
        mov     rcx, -1
        mov     rax, rdi
.LBB0_1:
        mov     rdx, rax
        shr     rdx
        add     rdx, 8
        add     rax, rdx
        cmovb   rax, rcx
        cmp     rax, rsi
        jb      .LBB0_1
        ret
```


After:

```asm
ensureTotalCapacity:
        add     rsi, 20
        mov     rcx, -1
        mov     dl, 59
        mov     r8b, 59
        cmovb   rsi, rcx
        lzcnt   rax, rsi
        sub     dl, al
        shl     eax, 4
        shrx    rdx, rsi, rdx
        and     edx, 15
        or      rdx, rax
        mov     rax, rdi
        xor     rdx, 1008
        add     rax, 20
        cmovb   rax, rcx
        lzcnt   rsi, rax
        sub     r8b, sil
        shl     esi, 4
        shrx    r8, rax, r8
        and     r8d, 15
        or      r8, rsi
        xor     esi, esi
        xor     r8, 1008
        sub     rdx, r8
        mov     r8d, 0
        cmovae  r8, rdx
        shr     r8d, 3
        inc     r8
        mov     edx, r8d
        and     r8d, 1
        shr     dl
        mov     r9d, edx
        and     r9b, 63
        sub     r9b, 1
        movzx   r9d, r9b
        cmovb   r9d, esi
        shlx    rsi, r8, r9
        mov     r9, rdi
        shr     r9
        bts     rsi, rdx
        add     r9, 8
        add     r9, rdi
        cmovb   r9, rcx
        mul     rsi
        cmovo   rax, rcx
        add     rax, -20
        cmp     r9, rax
        cmova   rax, r9
        ret
```

The original version of this article was posted [here](https://github.com/ziglang/zig/issues/15574). Please don't comment on that issue, but feel free to read the comments there.

Anyway, if you made it this far, thanks for reading!

‒ Validark
