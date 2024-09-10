{
  const boxes = new Array(32)
    .fill(0)
    .map((_, i) => [0 + 100 * (i % 16), Math.floor(i / 16) * 220])

  for (const [svg_i, [color]] of Object.entries([['blue']])) {
    const box_fills = [
      ...'export',
      ...new Array(10).fill(6),
      ...'export',
      ...new Array(10).fill('.'),
    ]

    const innerHTML = `<defs>
		<marker
			id="arrow"
			viewBox="0 0 10 10"
			refX="5"
			refY="5"
			markerWidth="3"
			markerHeight="3"
			orient="auto-start-reverse"
			fill="#fff">
			<path d="M 0 0 L 10 5 L 0 10 z" />
		</marker>

		<filter id="blurMe" x="-250%" y="-250%" width="600%" height="600">
			<feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blurred" />
		</filter>

		<filter id="blurMe3" x="-250%" y="-250%" width="600%" height="600">
			<feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blurred" />
		</filter>

		<filter id="blurMe2" x="-250%" y="-250%" width="600%" height="600">
			<feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blurred" />
		</filter>

		<filter id="blurMe6" x="-250%" y="-250%" width="600%" height="600">
			<feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blurred" />
		</filter>

		<filter id="blurMe1" x="-250%" y="-250%" width="600%" height="600">
			<feGaussianBlur in="SourceGraphic" stdDeviation="1" result="blurred" />
		</filter>

		<g id="deer70" stroke-linecap="round">
			<rect width="70" height="70" x="8" y="8" fill="none" />
		</g>

		<style>
		:root {
			--main-color1: #050b16;
			--main-color2: #0c182d;
			--neon-purple-color: #ff00ff;
			--neon-zig-color: #f7a41d;
			--neon-green-color: rgb(0, 255, 0);
			--neon-white-color: rgb(161, 161, 161);
			--neon-cyan-color: cyan;
			--neon-blue-color: rgb(48, 189, 255);
			--neon-orange-color: #ff0000;
		}
		.flicker, .neon-text text {
			font-family: 'JetBrains Mono', monospace;
			font-size: 40px;
		}

		.glow {
			opacity: 1;
		}

		.deer[data-color="white"] { stroke: var(--neon-white-color) }
			.neon-text[data-color="white"] {
			fill: var(--neon-white-color);
			stroke: var(--neon-white-color);
		}

		.deer[data-color="blue"] { stroke: var(--neon-blue-color) }
		.neon-text[data-color="blue"] {
			fill: var(--neon-blue-color);
			stroke: var(--neon-blue-color);
		}

		.deer[data-color="green"] { stroke: var(--neon-green-color) }
		.neon-text[data-color="green"] {
			fill: var(--neon-green-color);
			stroke: var(--neon-green-color);
		}

		.deer[data-color="red"] { stroke: var(--neon-orange-color) }
		.neon-text[data-color="red"] {
			fill: var(--neon-orange-color);
			stroke: var(--neon-orange-color);
		}

		.deer[data-color="purple"] { stroke: #ff00ff }
		.deer[data-color="zig"] { stroke: var(--neon-zig-color) }

		.red {
			stroke: #ff0000;
		}

		.text {
			font-size: 50px;
		}

		.neon-text[data-color="purple"] {
			fill: #ff00ff;
			stroke: #ff00ff;
		}

		.neon-text[data-color="zig"] {
			fill: var(--neon-zig-color);
			stroke: var(--neon-zig-color);
		}

		.white {
			opacity: .7;
		}

		.white2 {
			opacity: .6;
		}

		.white3 {
			opacity: .5;
		}
		</style>
	</defs>`.concat(
      Array.prototype
        .concat(
          boxes.map(
            (
              [i, j],
              iter,
            ) => `<g class="flicker deer lookup-late-appear-${+(iter >= 16)}" data-color="${color}" transform="translate(${i}, ${j})">
			<use xlink:href="#deer70" stroke-width="6"/>
			<use class="glow" stroke="#fff" xlink:href="#deer70" filter="url(#blurMe1)" stroke-width="1"/>
			<use class="glow" xlink:href="#deer70" filter="url(#blurMe)" stroke-width="10"/>
			<use xlink:href="#deer70" filter="url(#blurMe2)" stroke-width="6"/>
		</g>`,
          ),

          boxes.map(
            (
              [i, j],
              iter,
            ) => `<g class="flicker deer lookup-late-appear-${+(iter >= 16)}" data-color="${color}" transform="translate(${i}, ${j})">
			<use class="white" xlink:href="#deer70" stroke-width="4" stroke="#fff"/>
			<use filter="url(#blurMe3)" class="white2" xlink:href="#deer70" stroke-width="5" stroke="#fff"/>
			<use class="white3" xlink:href="#deer70" stroke-width="5" stroke="#fff"/>
		</g>`,
          ),

          boxes.map(([i, j], iter) => {
            const n = box_fills[iter]

            return `<g class="flicker neon-text lookup-late-appear-${+(iter >= 16)}${iter >= '22' ? ' lookup-disappear' : ''}" data-content="${n}" data-color="${color}" transform="translate(${i + 30.5 - (n.length === 2 ? 10 : 0)}, ${j + 56})">
				<text class="white" stroke-width="3"> ${n} </text>
				<text filter="url(#blurMe6)"> ${n} </text>
				<text filter="url(#blurMe)"> ${n} </text>
				<text class="white" stroke-width="1" stroke="#fff" fill="#fff"> ${n} </text>
				<text class="white2" stroke-width="2" stroke="#fff" fill="#fff" filter="url(#blurMe1)"> ${n} </text>
				<text class="white3" stroke-width="2" stroke="#fff" fill="#fff" filter="url(#blurMe3)"> ${n} </text>
			</g>`
          }),

          boxes.slice(box_fills.indexOf('.')).map(([i, j], iter) => {
            const n = '6'

            return `<g class="flicker neon-text lookup-late-arriver" data-content="${n}" data-color="${color}" transform="translate(${i + 30.5 - (n.length === 2 ? 10 : 0)}, ${j + 56})">
				<text class="white" stroke-width="3"> ${n} </text>
				<text filter="url(#blurMe6)"> ${n} </text>
				<text filter="url(#blurMe)"> ${n} </text>
				<text class="white" stroke-width="1" stroke="#fff" fill="#fff"> ${n} </text>
				<text class="white2" stroke-width="2" stroke="#fff" fill="#fff" filter="url(#blurMe1)"> ${n} </text>
				<text class="white3" stroke-width="2" stroke="#fff" fill="#fff" filter="url(#blurMe3)"> ${n} </text>
			</g>`
          }),

          boxes.slice(16).map(([i, j], iter) => {
            const n = '6'

            return `<g class="flicker neon-text lookup-late-appear" data-content="${n}" data-color="${iter < 6 ? 'green' : 'red'}" transform="translate(${i + 30.5 - (n.length === 2 ? 10 : 0)}, ${(j / 4) * 2.5 + 56})">
				<text class="white" stroke-width="3"> ${n} </text>
				<text filter="url(#blurMe6)"> ${n} </text>
				<text filter="url(#blurMe)"> ${n} </text>
				<text class="white" stroke-width="1" stroke="#fff" fill="#fff"> ${n} </text>
				<text class="white2" stroke-width="2" stroke="#fff" fill="#fff" filter="url(#blurMe1)"> ${n} </text>
				<text class="white3" stroke-width="2" stroke="#fff" fill="#fff" filter="url(#blurMe3)"> ${n} </text>
			</g>`
          }),

          boxes.slice(16).map(([i, j], iter) => {
            const n = iter.toString(16)

            return `<g class="flicker neon-text lookup-late-appear" data-content="${n}" data-color="${'white'}" transform="translate(${i + 30.5 - (n.length === 2 ? 10 : 0)}, ${(j / 4) * 1.25 + 56})">
				<text class="white" stroke-width="3"> ${n} </text>
				<text filter="url(#blurMe6)"> ${n} </text>
				<text filter="url(#blurMe)"> ${n} </text>
				<text class="white" stroke-width="1" stroke="#fff" fill="#fff"> ${n} </text>
				<text class="white2" stroke-width="2" stroke="#fff" fill="#fff" filter="url(#blurMe1)"> ${n} </text>
				<text class="white3" stroke-width="2" stroke="#fff" fill="#fff" filter="url(#blurMe3)"> ${n} </text>
			</g>`
          }),
        )
        .join('\n'),
    )

    // global_animations.push({
    //     section: "keyword-lookups",
    //     selector: `.whitespace-box-${svg_i}`,
    //     slide_num: svg_i,
    //     animation_delay: "6s",
    //     animation_duration: "1s",
    //     continuous: true,

    //     keyframes: {
    //         0:   { opacity: 0 },
    //         100: { opacity: 1 },
    //     }
    // });

    // let resize_event_id = 0
    // addEventListener('resize', event => {
    //   const cur_event_id = ++resize_event_id
    //   setTimeout(() => {
    //     if (cur_event_id === resize_event_id)
    //       document.getElementById(`lookup-svg-${svg_i}`).innerHTML = innerHTML
    //   }, 30)
    // })
    // document.getElementById(`lookup-svg-${svg_i}`).innerHTML = innerHTML
    const str = `<svg class="fragment" data-fragment-index="20" id="lookup-svg-0" viewBox="0 0 1500 500" xmlns="http://www.w3.org/2000/svg">${innerHTML}</svg>`
    console.log(str)
  }
}
