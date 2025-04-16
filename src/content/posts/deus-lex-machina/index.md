---
title: Deus Lex Machina
published: 2025-03-11T09:35:00
description: 'A simple technique for vectorized classification'
image: ''
tags: ['simd', 'tokenizer']
category: ''
draft: false
language: 'en-us'
---

<!-- Scanic Sanic -->
<!-- I Think, Therefore I Scan -->

<!-- The Vector Compact -->
<!-- Strength of Character -->
<!-- Lex Machina -->
<!-- A token of appreciation -->
<!-- Breaking character -->
<!-- In the fast lane -->

<!-- Token gesture -->
<!-- Scan and deliver -->
<!-- Vector Lexicon -->
<!-- Compress to Impress -->
<!-- Packed and ready -->
<!-- All Your Tokens Are Belong to Us -->
<!-- A parsing glance -->


Today, I am excited to announce the alpha release of a brand new compacting Zig tokenizer! You may find it in the following repository:

::github{repo="Validark/Accelerated-Zig-Parser" license="MIT"}

Give it a star and come back!

Please note it is not ready for prime-time just yet, since there are still more optimizations to be had, as well as support for more architectures. **At the moment, only AMD64 machines with AVX-512 instructions are supported.**

That being said, the new implementation can tokenize up to **2.75x faster** than the mainline implementation, currently at **1.4GB/s** on my laptop, with a lot of improvements coming soon!

![Zero the Ziguana](src/assets/images/Zero_2.svg)

## All Your Tokens Are Belong to Us

The above repository benchmarks 3 Zig tokenizers:

1. The tokenizer in the Zig Standard Library used by the 0.14 compiler.
2. ~~A heat-seeking tokenizer ([talk 1](https://www.youtube.com/watch?v=oN8LDpWuPWw&t=530s), [talk 2](https://www.youtube.com/live/FDiUKafPs0U&t=210s))~~ (had to temporarily remove it, but will add back by July)
3. A [compacting tokenizer](https://github.com/Validark/Accelerated-Zig-Parser/blob/7fa80343eb177c0220276492d467cdf6d3dabb73/src/main.zig#L1912) ([talk 3](https://www.youtube.com/watch?v=NM1FNB5nagk))

Benchmark results on my laptop with a Ryzen AI 9 HX 370:

```
       Read in files in 26.479ms (1775.63 MB/s) and used 47.018545MB memory with 3504899722 lines across 3253 files
Legacy Tokenizing took              91.419ms (0.51 GB/s, 38.34B loc/s) and used 40.07934MB memory
Tokenizing with compression took    33.301ms (1.41 GB/s, 105.25B loc/s) and used 16.209284MB memory
       That's 2.75x faster and 2.47x less memory than the mainline implementation!
```

## Headline features

The new [compacting tokenizer](https://github.com/Validark/Accelerated-Zig-Parser/blob/7fa80343eb177c0220276492d467cdf6d3dabb73/src/main.zig#L1912) processes an entire 64-byte chunk of source code at once (soon to be 512!). It includes:
  - A fully SIMDized [UTF-8 validator](https://github.com/Validark/Accelerated-Zig-Parser/blob/7fa80343eb177c0220276492d467cdf6d3dabb73/src/main.zig#L3160) ported from [simdjson](https://github.com/simdjson/simdjson/)/[simdutf](https://github.com/simdutf/simdutf/).
  - A fully branchless bit-manipulation routine to [determine which characters are escaped by backslashes](https://github.com/Validark/Accelerated-Zig-Parser/blob/7fa80343eb177c0220276492d467cdf6d3dabb73/src/main.zig#L1012). (Thanks to John Keiser (@jkeiser) for [designing this algorithm for simdjson](https://github.com/simdjson/simdjson/pull/2042).)
  - A loop which [parses all lines in a given chunk in parallel for strings/comments/character_literals/line_strings](https://github.com/Validark/Accelerated-Zig-Parser/blob/7fa80343eb177c0220276492d467cdf6d3dabb73/src/main.zig#L2007). Characters inside of these constructs must be exempted from comprising their own tokens.
  - [A multi-purpose vectorized table-lookup](https://github.com/Validark/Accelerated-Zig-Parser/blob/7fa80343eb177c0220276492d467cdf6d3dabb73/src/main.zig#L1302). It performs Vectorized-Classification (making it so we can produce a bitstring of any group of characters we care about in one additional instruction), as well as mapping all characters that may appear in a multi-char symbol into a range of [0, 15] while everything else is mapped into the range [128, 255]. Cognoscenti would recognize this as matching the semantics of a `vpshufb` instruction. It also is itself a mostly-correct vector of `kinds` fields (one of the pieces of information we need to output for each token).
  - [A mini non-deterministic finite state machine](https://github.com/Validark/Accelerated-Zig-Parser/blob/7fa80343eb177c0220276492d467cdf6d3dabb73/src/main.zig#L698) implemented using `vpshufb` instructions on the result of the vectorized table-lookup for multi-char-symbol matching, as well as a effectively-branchless (for real code) [reconciliation loop](https://github.com/Validark/Accelerated-Zig-Parser/blob/7fa80343eb177c0220276492d467cdf6d3dabb73/src/main.zig#L810) which accepts bitstrings indicating where valid 2 and 3 character multi-char symbols end and deleting the ones that are impossible due to overlap.
  - SIMDized hasher of up to 16 multi-char symbols at once, which works across chunk boundaries to produce the proper `kind` of mult-char symbols.
  - [A fully vectorized cross-chunk keyword hasher and validator](https://github.com/Validark/Accelerated-Zig-Parser/blob/7fa80343eb177c0220276492d467cdf6d3dabb73/src/main.zig#L1370) that pulls from a [common superstring](https://github.com/Validark/Accelerated-Zig-Parser/blob/7fa80343eb177c0220276492d467cdf6d3dabb73/src/main.zig#L490) holding all keywords in a total of 4 64-byte vectors. `vpgather` instructions are not used.
  - [Token-matching logic implemented almost entirely using bit-manipulation and SIMD operations](https://github.com/Validark/Accelerated-Zig-Parser/blob/7fa80343eb177c0220276492d467cdf6d3dabb73/src/main.zig#L2196), the things CPU's are the fastest at.
  - Logic void of almost all branches-- they are only used where they provide a performance benefit.

## Simplified Explanation

ELI5 How do we accomplish such speed? By processing entire chunks of 64-bytes (soon 512-bytes!) at once. Here's a basic implementation:

First, we produce a few bitstrings where each bit tells us a piece of information about a corresponding byte in the 64-byte `chunk` we process at once:

```zig
const V = @Vector(64, u8);
const chunk: V = ptr[0..64].*;

const alphas_lower: u64 =
    @as(u64, @bitCast(chunk >= @as(V, @splat('a')))) &
    @as(u64, @bitCast(chunk <= @as(V, @splat('z'))));

const alphas_upper: u64 =
    @as(u64, @bitCast(chunk >= @as(V, @splat('A')))) &
    @as(u64, @bitCast(chunk <= @as(V, @splat('Z'))));

const underscores: u64 =
    @bitCast(chunk == @as(V, @splat('_')));

const numerics: u64 =
    @as(u64, @bitCast(chunk >= @as(V, @splat('0')))) &
    @as(u64, @bitCast(chunk <= @as(V, @splat('9'))));

const alpha_underscores = alphas_lower | alphas_upper | underscores;
const alpha_numeric_underscores = alpha_underscores | numerics;
```

Next, we do a series of bitmanipulations to figure out the start and end positions of all tokens within our `chunk`. To find the starts and ends of identifiers, we do something similar to the following:

```zig
const identifier_starts = alpha_underscores & ~(alpha_numeric_underscores << 1);
const identifier_ends = alpha_numeric_underscores & ~(alpha_numeric_underscores >> 1);
```

Let's walk through how `identifier_starts` is computed very slowly:

1. `alpha_numeric_underscores << 1` Shifting left by `1` semantically moves our bits in the rightwards direction in our source file. This is due to the fact that this is written from a little-endian perspective, and every bit in `alpha_numeric_underscores` corresponds to a byte of `chunk`, therefore the bit-order inherits the byte order. This might seem like an indictment of little-endian machines, but actually little-endian is better for this kind of processing because when we do a subtraction we want the carry-bits to propagate in the direction of the last byte (rather than the reverse on a big-endian machine). If you don't understand that right now, that's okay, just take my word for it. The point is, `alpha_numeric_underscores << 1` produces a bitstring that indicates which positions in `chunk` had a alphanumeric/underscore **before** it. We could express this as a regular expression like `/(?<=\w)./g` ([regexr link](https://regexr.com/8e4r5))

2. We take the inverse of the previous bitstring. Overall we have `~(alpha_numeric_underscores << 1)`. This produces a bitstring that indicates which positions in `chunk` had a NON-alphanumeric/underscore before it. Also note that the start of the `chunk` is considered a NON-alphanumeric/underscore. This is because, in the first bit position, we shift in a 0, then unconditionally invert that to a `1`. `~(alpha_numeric_underscores << 1)` effectively matches the regular expression `/(?<=^|\W)./g` ([regexr link](https://regexr.com/8e4qs))


3. Next, we AND the last expression with `alpha_underscores`. This leaves us with a bitstring that tells us where we have an alpha/underscore character that was preceded by a NON-alpha_numeric_underscore character. As a regular expression, this would be `/(?<=^|\W)[a-zA-Z_]/g` ([regexr link](https://regexr.com/8e4rq))

`identifier_ends` is computed in much the same way but in the opposite direction.

With these two bistrings in hand, we can pass each of these into a *vector compaction* operation (called a "vector compression" on AVX-512 and RISC-V) to figure out where **all** identifiers in a chunk start and end simultaneously. A vector compaction accepts a bitstring and a vector, and keeps all elements in the vector which in the corresponding position in the bitstring have a 1 bit. The "kept" elements are concentrated in the front of the resulting vector, and the rest are discarded. In our case, we want to pass a vector which counts from 0 to 63 inclusive, so we can determine at which position in the chunk all tokens began and ended. See [this animation](https://validark.dev/presentations/simd-intro#keywords-lookup) as an example. For an exploration of how to do a vector compaction on ARM, see [my article on the subject](/posts/vector-compression-in-interleaved-space-on-arm/).




## Future plans

There is still work to do, and several optimizations to be had.

1. I have done a lot of work intended to try processing 512-bytes at once, since we can fit 512-bit bitstrings in an AVX-512 vector.
    - I wrote custom lowerings for u512 [shl](https://github.com/Validark/Accelerated-Zig-Parser/blob/7fa80343eb177c0220276492d467cdf6d3dabb73/src/main.zig#L1770)/[shr](https://github.com/Validark/Accelerated-Zig-Parser/blob/7fa80343eb177c0220276492d467cdf6d3dabb73/src/main.zig#L1781), borrowed a u512 [sub](https://github.com/Validark/Accelerated-Zig-Parser/blob/7fa80343eb177c0220276492d467cdf6d3dabb73/src/main.zig#L1802) implementation, and even wrote a [~70 line compiler](https://github.com/Validark/Accelerated-Zig-Parser/blob/7fa80343eb177c0220276492d467cdf6d3dabb73/src/main.zig#L3878) for convenient [vpternlogq](http://0x80.pl/notesen/2015-03-22-avx512-ternary-functions.html) optimization.

2. The way that [loop-carried variables are handled could probably be more efficient](https://github.com/Validark/Accelerated-Zig-Parser/blob/7fa80343eb177c0220276492d467cdf6d3dabb73/src/main.zig#L2455), either through [packing them all into a single register](https://github.com/Validark/Accelerated-Zig-Parser/blob/7fa80343eb177c0220276492d467cdf6d3dabb73/src/main.zig#L2471) (less likely to win) or using 2 or 3 enums instead of so many individual carried-bits (more likely to win). Luckily I wrote `carry.get`/`carry.set` methods so it shouldn't hurt too badly to swap the implementations out.

3. I intend to support multiple [comptime-switches](https://github.com/Validark/Accelerated-Zig-Parser/blob/7fa80343eb177c0220276492d467cdf6d3dabb73/src/main.zig#L317) for different ways of consuming the tokenizer. Some might prefer comments to be emitted, others prefer them to be omitted. Some people should use my idea of having a token be a 2-byte `len+tag` (with a 0 in the len indicating we need more than a byte, then using the next 4 bytes), others might want a more conventional 4-byte `start_index` + 4-byte `end_index` or `len`, and a 1-byte `tag`. Either way, iterators will be provided which abstract over the memory differences/implications.
    - I currently disabled the code which expands the len of keyword/symbol tokens to include surrounding whitespace+comments. This will come back under a flag soon.

I also intend to give the best talk I have ever given on how all of the components work together this July at [Utah Zig](https://www.youtube.com/@UtahZig).

## Running the Benchmark

Want to run the benchmark?

Well, unfortunately, at the moment, **only x86-64 machines supporting the AVX-512 instruction set are supported**. That means you need one of the last two generations of AMD hardware or a beefy Intel server.

If you do have a qualifying machine: First, clone my repository and then clone some Zig projects into `src/files_to_parse`. E.g.

```sh
git clone https://github.com/Validark/Accelerated-Zig-Parser.git --depth 1
cd Accelerated-Zig-Parser
cd src/files_to_parse
git clone https://github.com/ziglang/zig.git --depth 1
git clone https://github.com/tigerbeetle/tigerbeetle.git --depth 1
git clone https://github.com/oven-sh/bun.git --depth 1
# Whatever else you want
```

Next, make sure you have Zig 0.14 installed. Here is the one-off script from [Webi](https://webinstall.dev/webi/) to download and install Zig:

```sh
curl -sS https://webi.sh/zig@0.14 | sh; \
source ~/.config/envman/PATH.env
```

Personally, I use [Webi](https://webinstall.dev/webi/)'s helper script, which can be installed like so:

```sh
curl -sS https://webi.sh/webi | sh; \
source ~/.config/envman/PATH.env
```

The helper script reduces the noise:

```sh
webi zig@0.14
# could also try @latest or @stable
```

Then build it and execute!

```
zig build -Doptimize=ReleaseFast
./zig-out/bin/exe
```

If you are on Linux, you can enable performance mode like so:

```sh
sudo cpupower frequency-set -g performance
```

I typically bind to a single core, which can help with reliability, especially when testing on devices with separate performance and efficiency cores:

```sh
taskset -c 0 ./zig-out/bin/exe
```

###### (It feels like this would also prevent the OS from moving your running process to another core in the middle of a benchmark?)
