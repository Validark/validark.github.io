fetch("https://validark.github.io/mask_even_odd_bits.html")
	.then(c => c.text())
	.then(s => {
		const [article] = document.getElementsByTagName("article");
		const article_start = s.indexOf("<article>") + 6
		const article_end = s.indexOf("</article>", article_start)
		article.insertAdjacentHTML("afterend", s.slice(article_start, article_end));
	});
