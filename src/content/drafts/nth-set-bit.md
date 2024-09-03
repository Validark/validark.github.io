---
title: Finding the n'th set bit in a bitstring
published: 2023-07-18
description: 'How to find the nth set bit in a bitstring'
image: ''
tags: ['bit-manipulation']
category: ''
draft: true
language: 'en-us'
---

The two fundamental operations of [succinct data structures](https://en.wikipedia.org/wiki/Succinct_data_structure) and approximate membership filters like the [Counting Quotient Filter](https://users.cs.utah.edu/~pandey/courses/cs6530/fall22/papers/htfilters/3035918.3035963.pdf) are `select` and `rank`. `rank` simply returns the number of set bits (i.e. 1's) up to certain position and maps pretty trivially to a bitwise AND with a mask and a [popcount operation](https://en.wikipedia.org/wiki/Hamming_weight) (when operating at the level of a machine word). On the other hand, `select` returns the index of the <var>n</var>'th set bit, which unfortunately does not map cleanly to a single instruction on most instruction set architectures (ISA's). There are multiple ways to implement the `select` function, including binary subdivision, finding the target byte and using lookup tables, [and more](https://stackoverflow.com/questions/7669057/find-nth-set-bit-in-an-int). This article will cover the best x86-64 version as well as an implementation based on carryless multiplication.


<figure id="intro-picture">

<svg version="1.1" width="100%" viewBox="0 -14 516 80" style="background-color: rgb(240, 241, 242)"
	xmlns="http://www.w3.org/2000/svg">
	<text style="word-spacing: -0.25em; font-size: 13.3333px" x="4" y="-1">n = 10</text>
	<text x="123" y="-1" style="font-size: 13.3333px;">11</text>
	<text x="149" fill="#d14" y="-1" style="font-size: 13.3333px;">10</text>
	<text x="192" y="-1" style="font-size: 13.3333px;">9</text>
	<text x="204" y="-1" style="font-size: 13.3333px;">8</text>
	<text x="243" y="-1" style="font-size: 13.3333px;">7</text>
	<text x="294" y="-1" style="font-size: 13.3333px;">6</text>
	<text x="332" y="-1" style="font-size: 13.3333px;">5</text>
	<text x="369" y="-1" style="font-size: 13.3333px;">4</text>
	<text x="383" y="-1" style="font-size: 13.3333px;">3</text>
	<text x="397" y="-1" style="font-size: 13.3333px;">2</text>
	<text x="422" y="-1" style="font-size: 13.3333px;">1</text>
	<text x="473" y="-1" style="font-size: 13.3333px;">0</text>
	<text x="4" y="20">&nbsp;given:</text>
	<text x="100" y="20">00<tspan class="_1">1</tspan>0<tspan class="_1">1</tspan>00<tspan class="_1">11</tspan>00<tspan class="_1">1</tspan>000<tspan class="_1">1</tspan>00<tspan class="_1">1</tspan>00<tspan class="_1">111</tspan>0<tspan class="_1">1</tspan>000<tspan class="_1">1</tspan>00</text>
	<text x="4" y="40">&nbsp;&nbsp;mask:</text>
	<text x="100" y="40">0000<tspan class="_1">1</tspan>000000000000000000000000000</text>
	<text x="4" y="60">output:</text>
	<text x="100" y="60">@ctz(mask) => 27</text>
</svg>

<figcaption>
	An example select operation is depicted. In this case, we are looking for the 11th 1 bit starting from the right, which happens to be in bit position 27 (0-indexed).
</figcaption>

</figure>

## Method 1: pdep

<p>On x86-64 machines supporting the <a target="_blank" rel="noopener noreferrer" href="https://en.wikipedia.org/wiki/X86_Bit_manipulation_instruction_set#BMI2_(Bit_Manipulation_Instruction_Set_2)">BMI2 extension</a> (Intel Haswell 2013+, AMD Excavator 2015+, <a target="_blank" rel="noopener noreferrer" href="https://uops.info/table.html?search=pdep&cb_lat=on&cb_tp=on&cb_uops=on&cb_ports=on&cb_ZEN2=on&cb_ZEN3=on&cb_ZEN4=on&cb_measurements=on&cb_doc=on&cb_bmi=on">only fast on AMD since Zen 3 2020+</a>), we can use the <code>pdep</code> instruction to isolate the target bit. This instruction is also present on <a target="_blank" rel="noopener noreferrer" href="https://www.ibm.com/docs/en/openxl-c-and-cpp-lop/17.1.1?topic=functions-vec-pdep">POWER machines starting with Power10</a>, and <a target="_blank" rel="noopener noreferrer" href="https://developer.arm.com/documentation/ddi0602/latest/SVE-Instructions/BDEP--Scatter-lower-bits-into-positions-selected-by-bitmask-">optionally aarch64 machines with SVE2 (called bdep)</a>.</p>

<p><code>pdep</code> works by iterating over each
	bit from right to left in the second operand,
	and performs one of two tasks at each step. If
	the bit is 0, 0 is written to the output. If
	the bit is 1, it takes a bit from the first
	operand and writes that to the output. In
	effect, each one bit in the second operand is
	replaced by a subsequent bit in the first
	operand.</p>

<p>We can take advantage of this property by making a mask where the only 1 bit is at index <code>n</code>, then run it through <code>pdep</code>. This will isolate the <code>n</code>'th bit.</p>

<figure id="pdep-illustration">
<svg version="1.1" width="100%" viewBox="0 6 516 192" xmlns="http://www.w3.org/2000/svg">
	<!-- <rect x="1" y="1" width="980" height="198"
		stroke="black" fill="transparent"
		stroke-width="2" /> -->
	<text x="4" y="24">output:</text>
	<text class="nums" x="76" y="24">0000<tspan class="_1">1</tspan>000000000000000000000000000</text>
	<text x="4" y="50">&nbsp;&nbsp;op 2:</text>
	<text class="nums" x="76" y="50">00<tspan class="_1">1</tspan>0<tspan class="_1">1</tspan>00<tspan class="_1">11</tspan>00<tspan class="_1">1</tspan>000<tspan class="_1">1</tspan>00<tspan class="_1">1</tspan>00<tspan class="_1">111</tspan>0<tspan class="_1">1</tspan>000<tspan class="_1">1</tspan>00</text>
	<line id="line1" x1="481" x2="507" y1="52" y2="178"
		stroke="#000" stroke-width="2" />
	<line id="line2" x1="426" x2="494" y1="52" y2="178"
		stroke="#000" stroke-width="2" />
	<line id="line3" x1="398" x2="481" y1="52" y2="178"
		stroke="#000" stroke-width="2" />
	<line id="line4" x1="385" x2="467" y1="52" y2="178"
		stroke="#000" stroke-width="2" />
	<line id="line5" x1="370" x2="453" y1="52" y2="178"
		stroke="#000" stroke-width="2" />
	<line id="line6" x1="329" x2="439" y1="52" y2="178"
		stroke="#000" stroke-width="2" />
	<line id="line7" x1="287" x2="425" y1="52" y2="178"
		stroke="#000" stroke-width="2" />
	<line id="line8" x1="232" x2="411" y1="52" y2="178"
		stroke="#000" stroke-width="2" />
	<line id="line9" x1="191" x2="397" y1="52" y2="178"
		stroke="#000" stroke-width="2" />
	<line id="line10" x1="177" x2="383" y1="52" y2="178"
		stroke="#000" stroke-width="2" />
	<line id="line11" x1="135" x2="369" y1="52" y2="178"
		stroke="#d14" stroke-width="2" />
	<line id="line12" x1="107" x2="355" y1="52" y2="178"
		stroke="#000" stroke-width="2" />
		<style>
		#line1 {
			/*stroke-dashoffset: 48;
			stroke-dasharray: 200;*/
			animation: line1 5s ease 1s infinite forwards normal;
			/**/
		}
		@keyframes line1 {
			0% {
				opacity: 100%;
			}
			2.5% {
				/* stroke-dashoffset: 200; */
				opacity: 0%;
			}
			5% {
				opacity: 0%;
				/* stroke-dashoffset: 200; */
			}
			12.5% {
				/*stroke-dashoffset: 48;*/
				opacity: 100%;
			}
			100% {
				/*stroke-dashoffset: 48;*/
				opacity: 100%;
			}
		}
		#line2 {
			animation: line2 5s ease 1s infinite forwards normal;
		}
		@keyframes line2 {
			0% {
				opacity: 100%;
			}
			2.5% {
				opacity: 0%;
			}
			12.5% {
				/*stroke-dashoffset: 300;*/
				opacity: 0%;
			}
			20% {
				/*stroke-dashoffset: 91;*/
				opacity: 100%;
			}
			100% {
				/*stroke-dashoffset: 91;*/
				opacity: 100%;
			}
		}
		#line3 {
			animation: line3 5s ease 1s infinite forwards normal;
		}
		@keyframes line3 {
			0% {
				opacity: 100%;
			}
			2.5% {
				/*stroke-dashoffset: 300;*/
				opacity: 0%;
			}
			20% {
				/*stroke-dashoffset: 300;*/
				opacity: 0%;
			}
			27.5% {
				/*stroke-dashoffset: 22;*/
				opacity: 100%;
			}
			100% {
				/*stroke-dashoffset: 22;*/
				opacity: 100%;
			}
		}
		#line4 {
			/*stroke-dashoffset: 467;
			stroke-dasharray: 821;*/
			animation: line4 5s ease 1s infinite forwards normal;
			/**/
		}
		@keyframes line4 {
			0% {
				opacity: 100%;
			}
			2.5% {
				/*stroke-dashoffset: 821;*/
				opacity: 0%;
			}
			27.5% {
				/*stroke-dashoffset: 821;*/
				opacity: 0%;
			}
			35% {
				/*stroke-dashoffset: 467;*/
				opacity: 100%;
			}
			100% {
				/*stroke-dashoffset: 467;*/
				opacity: 100%;
			}
		}
		#line5 {
			/*stroke-dashoffset: 388;
			stroke-dasharray: 821;*/
			animation: line5 5s ease 1s infinite forwards normal;
			/**/
		}
		@keyframes line5 {
			0% {
				opacity: 100%;
			}
			2.5% {
				/*stroke-dashoffset: 821;*/
				opacity: 0%;
			}
			35% {
				/*stroke-dashoffset: 821;*/
				opacity: 0%;
			}
			42.5% {
				/*stroke-dashoffset: 388;*/
				opacity: 100%;
			}
			100% {
				/*stroke-dashoffset: 388;*/
				opacity: 100%;
			}
		}
		#line6 {
			/*stroke-dashoffset: 348;
			stroke-dasharray: 821;*/
			animation: line6 5s ease 1s infinite forwards normal;
			/**/
		}
		@keyframes line6 {
			0% {
				opacity: 100%;
			}
			2.5% {
				/*stroke-dashoffset: 821;*/
				opacity: 0%;
			}
			42.5% {
				/*stroke-dashoffset: 821;*/
				opacity: 0%;
			}
			50% {
				/*stroke-dashoffset: 348;*/
				opacity: 100%;
			}
			100% {
				/*stroke-dashoffset: 348;*/
				opacity: 100%;
			}
		}
		#line7 {
			/*stroke-dashoffset: 242;
			stroke-dasharray: 821;*/
			animation: line7 5s ease 1s infinite forwards normal;
			/**/
		}
		@keyframes line7 {
			0% {
				opacity: 100%;
			}
			2.5% {
				/*stroke-dashoffset: 821;*/
				opacity: 0%;
			}
			50% {
				/*stroke-dashoffset: 821;*/
				opacity: 0%;
			}
			57.5% {
				/*stroke-dashoffset: 242;*/
				opacity: 100%;
			}
			100% {
				/*stroke-dashoffset: 242;*/
				opacity: 100%;
			}
		}
		#line8 {
			/*stroke-dashoffset: 188;
			stroke-dasharray: 821;*/
			animation: line8 5s ease 1s infinite forwards normal;
			/**/
		}
		@keyframes line8 {
			0% {
				opacity: 100%;
			}
			2.5% {
				/*stroke-dashoffset: 821;*/
				opacity: 0%;
			}
			57.5% {
				/*stroke-dashoffset: 821;*/
				opacity: 0%;
			}
			65% {
				/*stroke-dashoffset: 188;*/
				opacity: 100%;
			}
			100% {
				/*stroke-dashoffset: 188;*/
				opacity: 100%;
			}
		}
		#line9 {
			/*stroke-dashoffset: 107;
			stroke-dasharray: 821;*/
			animation: line9 5s ease 1s infinite forwards normal;
			/**/
		}
		@keyframes line9 {
			0% {
				opacity: 100%;
			}
			2.5% {
				/*stroke-dashoffset: 821;*/
				opacity: 0%;
			}
			65% {
				/*stroke-dashoffset: 821;*/
				opacity: 0%;
			}
			72.5% {
				/*stroke-dashoffset: 107;*/
				opacity: 100%;
			}
			100% {
				/*stroke-dashoffset: 107;*/
				opacity: 100%;
			}
		}
		#line10 {
			/*stroke-dashoffset: 93;
			stroke-dasharray: 821;*/
			animation: line10 5s ease 1s infinite forwards normal;
			/**/
		}
		@keyframes line10 {
			0% {
				opacity: 100%;
			}
			2.5% {
				/*stroke-dashoffset: 821;*/
				opacity: 0%;
			}
			72.5% {
				/*stroke-dashoffset: 821;*/
				opacity: 0%;
			}
			80% {
				/*stroke-dashoffset: 93;*/
				opacity: 100%;
			}
			100% {
				/*stroke-dashoffset: 93;*/
				opacity: 100%;
			}
		}
		#line11 {
			/*stroke-dashoffset: 93;
			stroke-dasharray: 821;*/
			animation: line11 5s ease 1s infinite forwards normal;
			/**/
		}
		@keyframes line11 {
			0% {
				opacity: 100%;
			}
			2.5% {
				/*stroke-dashoffset: 821;*/
				opacity: 0%;
			}
			80% {
				/*stroke-dashoffset: 821;*/
				opacity: 0%;
			}
			87.5% {
				/*stroke-dashoffset: 93;*/
				opacity: 100%;
			}
			100% {
				/*stroke-dashoffset: 93;*/
				opacity: 100%;
			}
		}
		#line12 {
			/*stroke-dashoffset: 93;
			stroke-dasharray: 821;*/
			animation: line12 5s ease 1s infinite forwards normal;
			/**/
		}
		@keyframes line12 {
			0% {
				opacity: 100%;
			}
			2.5% {
				/*stroke-dashoffset: 821;*/
				opacity: 0%;
			}
			87.5% {
				/*stroke-dashoffset: 821;*/
				opacity: 0%;
			}
			95% {
				/*stroke-dashoffset: 93;*/
				opacity: 100%;
			}
			100% {
				/*stroke-dashoffset: 93;*/
				opacity: 100%;
			}
		}
	</style>
	<text x="4" y="190">&nbsp;&nbsp;op 1:</text>
	<text class="nums" x="76" y="190">000000000000000000000<tspan class="_1">1</tspan>0000000000</text>
</svg>
<figcaption>
	For <code>n</code>=10, we create a bitmask via <code>1 << 10</code>, then use <code>pdep</code> to isolate the 11'th set bit.
</figcaption>
</figure>

<p>From there, all we need to do is count the trailing zeros. Here is the code in <a target="_blank" rel="noopener noreferrer" style="text-decoration: none;" href="https://ziglang.org/">Zig</a>. (Note that after <a target="_blank" rel="noopener noreferrer"style="text-decoration: none; font-weight: 500;" href="https://github.com/ziglang/zig/issues/14995">#14995</a> is resolved there will be built-in support for the <code>pdep</code> operation.)</p>

```zig
fn pdep(src: u64, mask: u64) u64 {
    return asm ("pdep %[mask], %[src], %[ret]"
        : [ret] "=r" (-> u64),
        : [src] "r" (src),
          [mask] "r" (mask),
    );
}

fn select(bitstring: u64, n: u6) ?u6 {
	const mask = @as(u64, 1) << n;
	const isolate = pdep(mask, bitstring);
	if (isolate == 0) return null;
	return @truncate(@ctz(isolate));
}
```

<!-- <p>And here is the assembly</p>

<pre><code><span class="code-label">select:</span>
	<span class="code-instruction">mov</span>     <span class="code-register">eax</span>, <span class="code-num">1</span>
	<span class="code-instruction">shlx</span>    <span class="code-register">rax</span>, <span class="code-register">rax</span>, <span class="code-register">rsi</span>
	<span class="code-instruction">pdep</span>    <span class="code-register">rax</span>, <span class="code-register">rax</span>, <span class="code-register">rdi</span>
	<span class="code-instruction">tzcnt</span>   <span class="code-register">rax</span>, <span class="code-register">rax</span>
	<span class="code-instruction">ret</span></code>
</pre> -->

<p>The <code>pdep</code> instruction is very efficient on recent x86-64 hardware. It has a latency of 3	cycles and you can start a new one each cycle even if there are others in-flight. Unfortunately, it's <a target="_blank" rel="noopener noreferrer" href="https://uops.info/table.html?search=pdep&cb_lat=on&cb_tp=on&cb_uops=on&cb_ports=on&cb_ZEN2=on&cb_ZEN3=on&cb_ZEN4=on&cb_measurements=on&cb_doc=on&cb_bmi=on">quite inefficient on AMD architectures earlier than Zen 3</a>, and not supported on old machines, and support is still not planned for certain architectures (unfortunately the RISC-V <a href="https://docs.google.com/viewer?url=https://github.com/riscv/riscv-bitmanip/releases/download/v0.93/bitmanip-0.93.pdf"><span style="font-style: italic">Zbe</span> extension</a> with these instructions was not ratified into the <a target="_blank" rel="noopener noreferrer" href="https://github.com/riscv/riscv-bitmanip"><span style="font-style: italic">B</span> extension</a>). On such machines, you need an alternative method:</p>

## Method 2: prefix-xor

<p>The <a target="_blank" rel="noopener noreferrer" href="./mask_even_odd_bits.html#prefix-xor">prefix-xor operation</a> takes a bitstring and sets each bit to the XOR of all the bits to its right (and itself). By performing a bitwise AND of the given bitmask with its prefix-xor (or the bitwise negation of it), we can <a target="_blank" rel="noopener noreferrer" href="./mask_even_odd_bits.html#prefix-xor">extract either the evenly set bits or the oddly set bits</a>. For the `select` function, we want to isolate the evenly set bits when <var>n</var> is even, and isolate the oddly set bits when <var>n</var> is odd. We can then divide <var>n</var> by two and perform this recursively.</p>


<figure id="prefix-xor-recursive-visualization">
	<svg version="1.1" width="100%" viewBox="0 -14 516 200"
		xmlns="http://www.w3.org/2000/svg">
		<g id="step1">
		<text style="word-spacing: -0.25em; font-size: 13.3333px" x="4" y="-1">n = 10</text>
		<text x="123" y="-1" style="font-size: 13.3333px;">11</text>
		<text x="149" y="-1" style="font-size: 13.3333px;" fill="#d14">10</text>
		<text x="192" y="-1" style="font-size: 13.3333px;">9</text>
		<text x="204" y="-1" style="font-size: 13.3333px;">8</text>
		<text x="243" y="-1" style="font-size: 13.3333px;">7</text>
		<text x="294" y="-1" style="font-size: 13.3333px;">6</text>
		<text x="332" y="-1" style="font-size: 13.3333px;">5</text>
		<text x="369" y="-1" style="font-size: 13.3333px;">4</text>
		<text x="383" y="-1" style="font-size: 13.3333px;">3</text>
		<text x="397" y="-1" style="font-size: 13.3333px;">2</text>
		<text x="422" y="-1" style="font-size: 13.3333px;">1</text>
		<text x="473" y="-1" style="font-size: 13.3333px;">0</text>
		<text x="100" y="20">00<tspan class="_1">1</tspan>0<tspan class="_1">1</tspan>00<tspan class="_1">11</tspan>00<tspan class="_1">1</tspan>000<tspan class="_1">1</tspan>00<tspan class="_1">1</tspan>00<tspan class="_1">111</tspan>0<tspan class="_1">1</tspan>000<tspan class="_1">1</tspan>00</text>
		</g>
		<g id="step2">
		<text style="word-spacing: -0.25em; font-size: 13.3333px" x="4" y="39">n = 5</text>
		<text x="153" y="39" style="font-size: 13.3333px;" fill="#d14">5</text>
		<text x="204" y="39" style="font-size: 13.3333px;">4</text>
		<text x="294" y="39" style="font-size: 13.3333px;">3</text>
		<text x="369" y="39" style="font-size: 13.3333px;">2</text>
		<text x="397" y="39" style="font-size: 13.3333px;">1</text>
		<text x="473" y="39" style="font-size: 13.3333px;">0</text>
		<text x="100" y="60">0000<tspan class="_1">1</tspan>000<tspan class="_1">1</tspan>000000<tspan class="_1">1</tspan>00000<tspan class="_1">1</tspan>0<tspan class="_1">1</tspan>00000<tspan class="_1">1</tspan>00</text>
		</g>
		<g id="step3">
		<text style="word-spacing: -0.25em; font-size: 13.3333px" x="4" y="79">n = 2</text>
		<text x="153" y="79" style="font-size: 13.3333px;" fill="#d14">2</text>
		<text x="294" y="79" style="font-size: 13.3333px;">1</text>
		<text x="397" y="79" style="font-size: 13.3333px;">0</text>
		<text x="100" y="100">0000<tspan class="_1">1</tspan>0000000000<tspan class="_1">1</tspan>0000000<tspan class="_1">1</tspan>00000000</text>
		</g>
		<g id="step4">
		<text style="word-spacing: -0.25em; font-size: 13.3333px" x="4" y="119">n = 1</text>
		<text x="153" y="119" style="font-size: 13.3333px;" fill="#d14">1</text>
		<text x="397" y="119" style="font-size: 13.3333px;">0</text>
		<text x="100" y="140">0000<tspan class="_1">1</tspan>000000000000000000<tspan class="_1">1</tspan>00000000</text>
		</g>
		<g id="step5">
		<text style="word-spacing: -0.25em; font-size: 13.3333px" x="4" y="159">n = 0</text>
		<text x="153" y="159" style="font-size: 13.3333px;" fill="#d14">0</text>
		<text x="100" y="180">0000<tspan class="_1">1</tspan>000000000000000000000000000</text>
		</g>
		<style>
			#step1 {
				/*stroke-dashoffset: 48;
				stroke-dasharray: 200;*/
				animation: step1 30s ease 1s infinite forwards normal;
				/**/
			}
			@keyframes step1 {
				0% {
					opacity: 100%;
				}
				2.5% {
					/* stroke-dashoffset: 200; */
					opacity: 0%;
				}
				5% {
					opacity: 0%;
					/* stroke-dashoffset: 200; */
				}
				12.5% {
					/*stroke-dashoffset: 48;*/
					opacity: 100%;
				}
				100% {
					/*stroke-dashoffset: 48;*/
					opacity: 100%;
				}
			}
			#step2 {
				/*stroke-dashoffset: 91;
				stroke-dasharray: 300;*/
				animation: step2 30s ease 1s infinite forwards normal;
				/**/
			}
			@keyframes step2 {
				0% {
					opacity: 100%;
				}
				2.5% {
					/*stroke-dashoffset: 300;*/
					opacity: 0%;
				}
				12.5% {
					/*stroke-dashoffset: 300;*/
					opacity: 0%;
				}
				20% {
					/*stroke-dashoffset: 91;*/
					opacity: 100%;
				}
				100% {
					/*stroke-dashoffset: 91;*/
					opacity: 100%;
				}
			}
			#step3 {
				/*stroke-dashoffset: 22;
				stroke-dasharray: 300;*/
				animation: step3 30s ease 1s infinite forwards normal;
				/**/
			}
			@keyframes step3 {
				0% {
					opacity: 100%;
				}
				2.5% {
					/*stroke-dashoffset: 300;*/
					opacity: 0%;
				}
				20% {
					/*stroke-dashoffset: 300;*/
					opacity: 0%;
				}
				27.5% {
					/*stroke-dashoffset: 22;*/
					opacity: 100%;
				}
				100% {
					/*stroke-dashoffset: 22;*/
					opacity: 100%;
				}
			}
			#step4 {
				/*stroke-dashoffset: 467;
				stroke-dasharray: 821;*/
				animation: step4 30s ease 1s infinite forwards normal;
				/**/
			}
			@keyframes step4 {
				0% {
					opacity: 100%;
				}
				2.5% {
					/*stroke-dashoffset: 821;*/
					opacity: 0%;
				}
				27.5% {
					/*stroke-dashoffset: 821;*/
					opacity: 0%;
				}
				35% {
					/*stroke-dashoffset: 467;*/
					opacity: 100%;
				}
				100% {
					/*stroke-dashoffset: 467;*/
					opacity: 100%;
				}
			}
			#step5 {
				/*stroke-dashoffset: 388;
				stroke-dasharray: 821;*/
				animation: step5 30s ease 1s infinite forwards normal;
				/**/
			}
			@keyframes step5 {
				0% {
					opacity: 100%;
				}
				2.5% {
					/*stroke-dashoffset: 821;*/
					opacity: 0%;
				}
				35% {
					/*stroke-dashoffset: 821;*/
					opacity: 0%;
				}
				42.5% {
					/*stroke-dashoffset: 388;*/
					opacity: 100%;
				}
				100% {
					/*stroke-dashoffset: 388;*/
					opacity: 100%;
				}
			}
		</style>
	</svg>
	<figcaption>
		An example select operation is depicted. In this case, we are looking for the 11th 1 bit starting from the right, which happens to be in bit position 27 (0-indexed).
	</figcaption>
</figure>

<p>I see two ways of efficiently flipping between finding the evenly and oddly set bits depending on whether <var>n</var> is even or odd.</p>

<ol style="width: 100%;">
<li><p>Isolating the least significant bit from <var>n</var> and XOR'ing it with a bitstring of all ones (i.e. -1), then performing our carryless multiply on the resulting value and the given bitstring.</p>

```zig
fn select(mask: u64, n: u6) ?u6 {
    const ones: u64 = std.math.maxInt(u64);
    var m = mask;
    inline for (0..6) |i| {
        const f = ((n >> i) & 1) ^ ones;
        m &= @mulCarryless(m, f);
    }
    if (m == 0) return null;
    return @truncate(@ctz(m));
}
```

</li>
<li><p>Producing a bitmask where all the bits are the same as the least significant bit of <var>n</var> and XOR'ing that with the value we get from our carryless multiply between the given bitstring and a bitstring of all ones (i.e. -1).</p>

```zig
fn select(m: u64, n: u6) ?u6 {
    var mask = m;
    inline for (0..6) |i| {
        const msb = @as(i64, n) << (63 - i);
        const ext: u64 = @bitCast(msb >> 63);
        mask &= prefixXOR(mask) ^ ext;
    }
    if (mask == 0) return null;
    return @truncate(@ctz(mask));
}
```

</li>
</ol>

<p>In both cases, the CPU should be able to work ahead and compute the extra value before the bitstring is ready to be carryless multiplied. However, I presume the first option may start its first carryless multiply 2 cycles later (<code>all_ones ^ (n & 1)</code>). I presume the second option takes one extra cycle per step because we have to perform an extra XOR after the carryless multiply. Therefore, I believe the first technique will be faster overall because we are planning on doing more than 2 iterations. <span style="text-decoration: line-through;">I will update this post with a Godbolt link once <a target="_blank" rel="noopener noreferrer"style="text-decoration: none; font-weight: 500;" href="https://github.com/ziglang/zig/issues/16435">#16435</a> is fixed.</span></p>

<p>I would be interested to hear from anyone with a real-world application running an implementation of `select` on something other than x86-64. If your machine supports a fast carryless multiply, this just might work for you! If carryless multiply can be computed in 3 cycles, I estimate the first version should take ~28 cycles and the second version should take ~32 cycles. It depends on how many set-up instructions are needed and whether your application can assert that you are passing in an <var>n</var> fewer than the population count of the bitstring (if not, add 1 to my estimates).</p>

<p><span style="font-weight: bold;">Update:</span> <a target="_blank" rel="noopener noreferrer"style="text-decoration: none; font-weight: 500;" href="https://github.com/ziglang/zig/issues/16435">#16435</a> was fixed and I revisited this problem. It turns out that the carryless multiply solution was <a target="_blank" rel="noopener noreferrer" href="https://stackoverflow.com/a/77752515/11911769">pretty slow on my machine</a>. I have added the best non-pdep solution below.</p>

## Method 3: prefix-sum-popcount

<p>Another solution to this problem is to find the popcount of each byte, then the prefix-sum of those popcounts:</p>


<figure id="intro-picture">
	<svg version="1.1" width="100%" viewBox="0 -14 516 84"
		xmlns="http://www.w3.org/2000/svg">
		<text style="word-spacing: -0.25em; font-size: 13.3333px" x="4" y="-1">n = 10</text>
		<text x="123" y="-1" style="font-size: 13.3333px;">11</text>
		<text x="149" fill="#d14" y="-1" style="font-size: 13.3333px;">10</text>
		<text x="192" y="-1" style="font-size: 13.3333px;">9</text>
		<text x="204" y="-1" style="font-size: 13.3333px;">8</text>
		<text x="243" y="-1" style="font-size: 13.3333px;">7</text>
		<text x="294" y="-1" style="font-size: 13.3333px;">6</text>
		<text x="332" y="-1" style="font-size: 13.3333px;">5</text>
		<text x="369" y="-1" style="font-size: 13.3333px;">4</text>
		<text x="383" y="-1" style="font-size: 13.3333px;">3</text>
		<text x="397" y="-1" style="font-size: 13.3333px;">2</text>
		<text x="422" y="-1" style="font-size: 13.3333px;">1</text>
		<text x="473" y="-1" style="font-size: 13.3333px;">0</text>
		<text x="4" y="20">&nbsp;given:</text>
		<text x="100" y="20">00<tspan class="_1">1</tspan>0<tspan class="_1">1</tspan>00<tspan class="_1">11</tspan>00<tspan class="_1">1</tspan>000<tspan class="_1">1</tspan>00<tspan class="_1">1</tspan>00<tspan class="_1">111</tspan>0<tspan class="_1">1</tspan>000<tspan class="_1">1</tspan>00</text>
		<text x="4" y="40">popc's:</text>
		<text x="100" y="44">└───3──┘└───3──┘└───4──┘└───2──┘</text>
		<text x="4" y="60">prefix:</text>
		<text x="100" y="64">└──12──┘└───9──┘└───6──┘└───2──┘</text>
	</svg>
	<figcaption>
		Once we have the prefix-sum of the popcounts of the bytes, then finding the byte we are in is a matter of finding the first prefix-sum &ge; n. Note that the prefix-sum may appear backwards due to little-endianness, but is correct.
	</figcaption>
</figure>

<p>We might find the byte containing bit <var>n</var> like so:</p>

```zig
fn findByteContainingBitN(m: u64, n: u6) u4 {
    const v: @Vector(8, u8) = @bitCast(m);
    const prefix_sums = std.simd.prefixScan(.Add, 1, @popCount(v));
    const broadcasted = @as(@TypeOf(v), @splat(@as(u8, n)));
    return std.simd.countTrues(prefix_sums <= broadcasted);
}
```

<p>Then, we take the prefix-sum of the byte before the one we are in, and subtract it from <var>n</var>. That is the number of bits into the containing byte we are in, which we can look up in a table.</p>


```zig
fn select(m: u64, n: u6) ?u6 {
    const v: @Vector(8, u8) = @bitCast(m);
    const prefix_sums = std.simd.prefixScan(.Add, 1, @popCount(v));
    const broadcasted = @as(@TypeOf(v), @splat(@as(u8, n)));
    const byte_index: u4 = std.simd.countTrues(prefix_sums <= broadcasted);
    if (byte_index == 8) return null;

    const prev_prefix_sum = if (byte_index == 0) 0 else prefix_sums[byte_index - 1];
    return 8 * @as(u6, byte_index) +
           lookup_table[v[byte_index]][n - prev_prefix_sum];
}
```

<p>Unfortunately, most ISA's outside of RISC-V do not have a prefix-sum instruction that operates on vectors, so the optimal solution is likely to be the SWAR implementation on most machines without a fast <code>pdep</code> instruction.</p>

<p>Gog & Petri had this idea <a target="_blank" rel="noopener noreferrer" href="https://github.com/simongog/sdsl/blob/be00712861fa4d3a1acda9fe683894e5c06ade69/include/sdsl/bitmagic.hpp#L1069-L1100">many years ago</a>, improved a little by Sebastiano Vigna in <a target="_blank" rel="noopener noreferrer" href="https://github.com/foudrer/Sux/blob/fc451433f968ad4dd6c3be972260f82a41c512e6/select.h#L152-L166">foudrer/Sux</a> and Giuseppe Ottaviano introduced further improvements when creating <a target="_blank" rel="noopener noreferrer" href="https://github.com/ot/succinct/blob/669eebbdcaa0562028a22cb7c877e512e4f1210b/broadword.hpp#L86-L101">ot/succinct</a>. I made <a target="_blank" rel="noopener noreferrer" href="https://github.com/ot/succinct/pull/7">a few minor optimizations on top of Ottaviano's implementation</a>.</p>

```zig
fn select(m: u64, n: u6) u8 {
    // Same trick as https://www.chessprogramming.org/Population_Count#SWAR-Popcount
    // except we keep all the prefix-sums
    const ones: u64 = 0x0101010101010101;
    var i = m;
    i -= (i >> 1) & 0x5555555555555555;
    i = (i & 0x3333333333333333) + ((i >> 2) & 0x3333333333333333);
    // any time you see `* ones`, that is finding the inclusive prefix-sum
    const prefix_sums = (((i + (i >> 4)) & 0x0F0F0F0F0F0F0F0F) * ones);

    // Produce a mask where there is a bit in each byte indicating whether
    // a particular prefix-sum is higher than `n`
    const broadcasted = ones * (@as(u64, n) | 0x80);
    const isolate = ones * if (USE_POPCNT) 0x80 else 0x01;
    const mask = ((broadcasted - prefix_sums) >> if (USE_POPCNT) 0 else 7) & isolate;
    if (mask == isolate) return 64; // there is no n'th bit!

    // find the number of bytes with insufficient popcount-prefix-sums
    // shift left by 3 to get the bit-offset
    const bit_offset: u6 = if (USE_POPCNT)
        @intCast(@popCount(mask) << 3)
    else
        // it is safe to do `>> 53` instead of `>> 56 << 3` because the max `mask` is
        // 0b00001000_00000111_00000110_00000101_00000100_00000011_00000010_00000001
        //  Therefore ^^^ these bits are guaranteed to be 0
        @intCast((mask * ones) >> 53);

    const prefix_sum: u6 = @truncate(prefix_sums << 8 >> bit_offset);
    const target_byte: u8 = @truncate(m >> bit_offset);
    const n_for_target_byte: u3 = @intCast(n - prefix_sum);

    return lookup_table[target_byte][n_for_target_byte] + bit_offset;
}

const Target = std.Target;

const USE_POPCNT = switch (builtin.cpu.arch) {
    .aarch64_32,
	.aarch64_be,
	.aarch64 => false,

    .mips,
	.mips64,
	.mips64el,
	.mipsel => Target.mips.featureSetHas(builtin.cpu.features, .cnmips),

	.powerpc,
	.powerpc64,
	.powerpc64le,
	.powerpcle => Target.powerpc.featureSetHas(builtin.cpu.features, .popcntd),

    .s390x =>
		Target.s390x.featureSetHas(builtin.cpu.features, .miscellaneous_extensions_3),

    .ve => true,
    .avr => true,
    .msp430 => true,

    .riscv32,
	.riscv64 => Target.riscv.featureSetHas(builtin.cpu.features, .zbb),

    .sparc,
	.sparc64,
	.sparcel => Target.sparc.featureSetHas(builtin.cpu.features, .popc),

    .wasm32,
	.wasm64 => true,

	.x86,
	.x86_64 => Target.x86.featureSetHas(builtin.cpu.features, .popcnt),

	else => false,
};
```

<p>The full code is available <a target="_blank" rel="noopener noreferrer" href="https://gist.github.com/Validark/1c49b2b00ff930df76a3ee1d22f18244">here</a>. <a target="_blank" rel="noopener noreferrer" href="https://gist.github.com/Validark/eded47a57944e4a0357612bda3c51871">Here is my test bench</a>. <a target="_blank" rel="noopener noreferrer" href="https://zig.godbolt.org/z/491ffTjrr">Here is a godbolt playground</a>.</p>

<p>Happy hacking!<br>&horbar;&#x202F;Validark</p>


<!-- <script src="https://utteranc.es/client.js"
        repo="validark/validark.github.io"
        issue-term="title"
        label="comments section"
        theme="github-light"
        crossorigin="anonymous"
        async>
</script> -->



<!-- fn selectByte(m: u8, n: u3) u4 {
    const ones: u64 = 0x0101010101010101;
    const unique_bytes: u64 = 0x8040_2010_0804_0201;
    const unique_bytes_diff_from_msb = (ones * 0x80) - unique_bytes;
    const prefix_sums = (((((m * ones) & unique_bytes) + unique_bytes_diff_from_msb) >> 7) & ones) * ones;

    const broadcasted = ones * (@as(u64, n) | 0x80);
    const isolate = ones * if (USE_POPCNT) 0x80 else 0x01;
    const mask = (((broadcasted - prefix_sums) >> if (USE_POPCNT) 0 else 7) & isolate);

    if (mask == isolate) return 8;

    const bit_index: u3 = if (USE_POPCNT)
        @intCast(@popCount(mask))
    else
        @intCast((mask * ones) >> 56);

    return bit_index;
} -->
