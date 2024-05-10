import { zigLanguageSupport } from "./plugin/highlight/highlightjs-zig/src/index.mjs"

const cursor_increments = document.getElementsByClassName("tokenize1")[0].getAttribute("data-line-numbers").split('|').slice(1).map((e, i) => [e, i]).filter(([e]) => e === '11' || e === '46').map(([, o]) => o);
const cursor_increments2 = document.getElementsByClassName("tokenize2")[0].getAttribute("data-line-numbers").split('|').slice(1).map((e, i) => [e, i]).filter(([e]) => e === '20' || e === '52').map(([, o], i) => [o, [6, 1, 2, 1, 12][i]]);


// function runAnim(e) {
// 	const id = e.id;
// 	e.id = "";
// 	void e.offsetHeight;
// 	e.id = id;
// }

// function bitClick(e) {
// 	this.classList.remove("bit-" + this.innerText);
// 	this.classList.add("bit-" + (this.innerText ^= 1));
// 	render();
// }

// for (const bit of bits) {
// 	bit.classList.add("bit-" + bit.innerText);
// 	bit.addEventListener("click", bitClick);
// }

// function pdep_algo_state_change(forward, state) {
// 	// state can be -1
// 	console.log(forward, state);
// 	if (state === -1) {
// 		bits8_stay.removeAttribute("alive");
// 	}
// 	if (state === 0) {
// 		bits8_255.removeAttribute("fade-out");
// 		bits8_stay.setAttribute("alive", true);
// 	}
// 	if (forward && state === 1) {


// 		bits8_255.setAttribute("fade-out", "true");
// 		bits8.setAttribute("fade-in", "true")
// 		runAnim(bits8);
// 		runAnim(bits8_255);
// 	}
// }

// const dispatchers = new Map([
// 	["pdep-algo", pdep_algo_state_change]
// ]);

Reveal.initialize({
	highlight: {
		beforeHighlight: hljs => hljs.registerLanguage("zig", zigLanguageSupport)
	},
	hash: true,

	// Learn about plugins: https://revealjs.com/plugins/
	plugins: [RevealMarkdown, RevealHighlight, RevealNotes, RevealMath.KaTeX],
	width: 1920,
	height: 1080,
	// transition: "none",
	// backgroundTransition: "none",
	// transitionSpeed: 1000,
	// center: false,
	progress: false,
	showNotes: true
});

// let current_section = null;
// let current_code_blocks;

const fragmentchange = (event, section, data_fragment_index) => {
	// console.time("gotElements");
	// if (current_section !== section) {
	// 	current_section = section;
	// 	current_code_blocks = section.querySelectorAll("code:not(#columnCounts-line)");

	// 	for (const code_block of current_code_blocks) {
	// 		const current_data_fragment_index = +(code_block.getAttribute("data-fragment-index") ?? -1);
	// 		if (current_data_fragment_index < data_fragment_index - 1 || current_data_fragment_index > data_fragment_index + 1) {
	// 			// code_block.setAttribute("hidden", "");
	// 			// code_block.setAttribute("aria-hidden", "true");
	// 			code_block.classList.remove("visible");
	// 		} else {
	// 			// code_block.removeAttribute("aria-hidden");
	// 		}
	// 	}
	// }
	// console.timeEnd("gotElements");

	// console.time("doElements");
	// for (let i = 0; i < data_fragment_index; i++) {
	// 	const code_block = current_code_blocks[i];
	// 	code_block.classList.remove("visible");
	// }
	// for (const code_block of current_code_blocks) {
	// 	const current_data_fragment_index = +(code_block.getAttribute("data-fragment-index") ?? -1);
	// 	if (current_data_fragment_index < data_fragment_index - 1 || current_data_fragment_index > data_fragment_index + 1) {
	// 		// code_block.setAttribute("hidden", "");
	// 		// code_block.setAttribute("aria-hidden", "true");
	// 		code_block.classList.remove("visible");
	// 	} else {
	// 		// code_block.removeAttribute("aria-hidden");
	// 	}
	// }
	// if (data_fragment_index >= 0) {
	// 	current_code_blocks[data_fragment_index - 1].classList.remove("visible");
	// 	// current_code_blocks[data_fragment_index - 1].setAttribute("hidden", "");
	// 	// current_code_blocks[data_fragment_index - 1].setAttribute("aria-hidden", "true");
	// }

	// if (data_fragment_index + 1 < current_code_blocks.length) {
	// 	// current_code_blocks[data_fragment_index + 1].removeAttribute("hidden");
	// 	// current_code_blocks[data_fragment_index + 1].removeAttribute("aria-hidden");
	// }
	// console.timeEnd("doElements");

	// for (const code_block of current_code_blocks) {
	// 	const current_data_fragment_index = +(code_block.getAttribute("data-fragment-index") ?? -1);
	// 	if (current_data_fragment_index < data_fragment_index - 1 || current_data_fragment_index > data_fragment_index + 1) {
	// 		code_block.setAttribute("hidden", "");
	// 		code_block.setAttribute("aria-hidden", "true");
	// 	} else {
	// 		code_block.removeAttribute("aria-hidden");
	// 		code_block.removeAttribute("hidden");
	// 	}
	// }
	// console.timeEnd("doElements");

	// console.log("hidden: " + hidden.toSorted((a, b) => a - b).join(', '));
	// console.log("visible: " + visible.toSorted((a, b) => a - b).join(', '));
}

Reveal.on('fragmentshown', (event) => {
	let { parentNode } = event.fragment
	for (; parentNode.tagName !== "SECTION"; { parentNode } = parentNode);
	parentNode.removeAttribute("present-went-backward");
	parentNode.setAttribute("present-went-forward", "");
	parentNode.setAttribute("fragment-" + event.fragment.getAttribute("data-fragment-index"), "");
	fragmentchange(event, parentNode, +(event.fragment.getAttribute("data-fragment-index") ?? -1));
	// data-fragment-index="35"
	// console.log(event.fragment.getAttribute("data-fragment-index"), "fragmentshown");
});

Reveal.on('fragmenthidden', event => {
	let { parentNode } = event.fragment
	for (; parentNode.tagName !== "SECTION"; { parentNode } = parentNode);
	parentNode.removeAttribute("present-went-forward");
	parentNode.setAttribute("present-went-backward", "");
	const current_frame_index = event.fragment.getAttribute("data-fragment-index");
	if (current_frame_index)
		parentNode.removeAttribute("fragment-" + current_frame_index);
	fragmentchange(event, parentNode, event.fragment.getAttribute("data-fragment-index") - 1);
	// console.log(event.fragment.getAttribute("data-fragment-index"), "fragmenthidden");
});

const prelim_slide = document.getElementById("prelim_slide");

function onSlideChange(event) {
	const { previousSlide, currentSlide } = event;
	if (previousSlide === prelim_slide) {
		document.getElementById("opening_animation").innerHTML = OPENING_ANIMATION_HTML;
	}
	// console.log(event.previousSlide, event.currentSlide, event.indexh, event.indexv, "slidechanged", +currentSlide.getAttribute("data-fragment"));

	if (previousSlide) {
		for (let i = 0; previousSlide.hasAttribute(`fragment-${i}`); i++)
			previousSlide.removeAttribute(`fragment-${i}`);

		previousSlide.removeAttribute("present-went-backward");
		previousSlide.removeAttribute("present-went-forward");

		for (const iframe of previousSlide.getElementsByTagName("iframe")) {
			iframe.src = "";
		}
	}

	for (let i = 0, j = +currentSlide.getAttribute("data-fragment"); i <= j; i++) {
		currentSlide.setAttribute("fragment-" + i, "");
	}

	currentSlide.setAttribute(+currentSlide.getAttribute("data-fragment") ? "present-went-backward" : "present-went-forward", "");



	// setTimeout(() => onSlideChange(event), 1000)
	// currentSlide;

	// while (true)

}

const iframes_sources = new Map();
let ready = false;
Reveal.on('slidechanged', event => {
	onSlideChange(event);
	setTimeout(() => onSlideChange(event), 10)

	if (ready) {
		const slides = [...document.getElementsByTagName("section")];
		for (let i = 0; i <= 1; i++) {
			const slide = slides[event.indexh + i];
			if (slide) {
				for (const iframe of slide.getElementsByTagName("iframe")) {
					iframe.src = iframes_sources.get(iframe.id);
				}
			}
		}
	}

	// console.log(event.currentSlide.id);
	// console.log(all_styles);
	// styleSheet.innerHTML = all_styles.get(event.currentSlide.id);
});

Reveal.on('ready', event => {
	ready = true;
	const { currentSlide } = event;
	const data_fragment = +currentSlide.getAttribute("data-fragment");
	for (let i = 0; i <= data_fragment; i++) {
		currentSlide.setAttribute("fragment-" + i, "");
	}
	currentSlide.setAttribute("present-went-forward", "");

	// dispatchers.get(event.fragment.id)?.(false, event.fragment.getAttribute("data-fragment-index") - 1);

	for (const algo of ["pdep-algo", "prefix-sum-algo"]) {
		for (const first_line_of_function of document.querySelectorAll(`code#${algo} > table > tbody > tr:nth-child(1) > td.hljs-ln-line.hljs-ln-code`)) {
			const html = first_line_of_function.innerHTML;
			const start = html.slice(0, html.indexOf("@Vector")).lastIndexOf("<span");
			const end = html.lastIndexOf(")") + 1;
			first_line_of_function.innerHTML = `${html.slice(0, start)}<span class="return-type">${html.slice(start, end)}</span>${html.slice(end)}`;
			// console.log(html.slice(start, end));
		}
	}

	outer: for (const code of document.querySelectorAll("code.hljs")) {
		for (const tr of code.querySelectorAll("table > tbody > tr")) {
			if (!tr.classList.contains("highlight-line")) {
				continue outer;
			}
		}

		code.setAttribute("all-highlighted", "");
	}

	/* <div class="main-wrapper">
	  <div class="noise-wrapper">
		<div class="noise"></div>
	  </div>
	</div> */

	console.log([...document.getElementsByClassName("slide-background")].length, "slide-backgrounds");
	for (const slide_background of document.getElementsByClassName("slide-background")) {
		const div1 = document.createElement("div");
		const div2 = document.createElement("div");
		const div3 = document.createElement("div");
		div1.classList.add("stars")
		div2.classList.add("stars2")
		div3.classList.add("stars3")

		const div4 = document.createElement("div");
		const div5 = document.createElement("div");
		const div6 = document.createElement("div");
		div4.classList.add("main-wrapper");
		div5.classList.add("noise-wrapper");
		div6.classList.add("noise");

		div5.insertAdjacentElement("beforeend", div6);
		div4.insertAdjacentElement("beforeend", div5);
		// slide_background.insertAdjacentElement("beforeend", div4);


		// slide_background.insertAdjacentElement("beforeend", div1);
		// slide_background.insertAdjacentElement("beforeend", div2);
		// slide_background.insertAdjacentElement("beforeend", div3);
	}

	let iframe_id = 0;
	const current_iframes = new Set(currentSlide.getElementsByTagName("iframe"))

	for (const iframe of document.getElementsByTagName("iframe")) {
		iframes_sources.set(iframe.id = "iframe" + ++iframe_id, iframe.src);
		if (!current_iframes.has(iframe))
			iframe.src = "";
	}


	document.querySelector("#columnCounts-line > span.hljs-operator").insertAdjacentHTML("afterend", `<span class="cursor-position">&NewLine;${cursor_increments.map((data_fragment_index) => `<span class="fragment custom cursor-space" data-fragment-index="${data_fragment_index + 1}"> </span>`).join('')}^ cur</span>`);

	document.querySelector("#columnCounts-line2 > span.hljs-operator").insertAdjacentHTML("afterend", `<span class="cursor-position">&NewLine;${cursor_increments2.map(([data_fragment_index, num_spaces]) => `<span class="fragment custom cursor-space" data-fragment-index="${data_fragment_index + 1}">${' '.repeat(num_spaces)}</span>`).join('')}^ cur</span>`);

	console.log(cursor_increments2.map((data_fragment_index) => `<span class="fragment custom cursor-space" data-fragment-index="${data_fragment_index + 1}">      </span>`).join(''));

	// let parentNode = event.currentSlide
	// for (; parentNode.tagName !== "SECTION"; { parentNode } = parentNode);
	fragmentchange(event, currentSlide, data_fragment);
});
