import { getCollection } from 'astro:content'
import type { BlogPostData } from '@/types/config'
import I18nKey from '@i18n/i18nKey'
import { i18n } from '@i18n/translation'

export async function getSortedPosts(): Promise<
	{ data: BlogPostData; slug: string }[]
> {
	const allBlogPosts = (await getCollection('posts', ({ data }) => {
		return import.meta.env.PROD ? data.draft !== true : true
	})) as unknown as { data: BlogPostData; slug: string }[]

	const sorted = allBlogPosts.sort(
		(a: { data: { published: Date } }, b: { data: { published: Date } }) => {
			const dateA = new Date(a.data.published)
			const dateB = new Date(b.data.published)
			return dateA > dateB ? -1 : 1
		},
	)

	for (let i = 1; i < sorted.length; i++) {
		sorted[i].data.nextSlug = sorted[i - 1].slug
		sorted[i].data.nextTitle = sorted[i - 1].data.title
	}
	for (let i = 0; i < sorted.length - 1; i++) {
		sorted[i].data.prevSlug = sorted[i + 1].slug
		sorted[i].data.prevTitle = sorted[i + 1].data.title
	}

	return sorted
}

export type Tag = {
	name: string
	count: number
}

export async function getTagList(): Promise<Tag[]> {
	const allBlogPosts = await getCollection<'posts'>('posts', ({ data }) => {
		return import.meta.env.PROD ? data.draft !== true : true
	})

	const countMap = new Map();

	for (const post of allBlogPosts) {
		for (const tag of post.data.tags) {
			countMap.set(tag, (countMap.get(tag) ?? 0) + 1);
		}
	}

	return [["all", allBlogPosts.length], ...countMap.entries()]
		.map(([name, count]) => ({ name, count }))
		.sort((a, b) => a.name === "all" ? -1 : b.name === "all" ? 1 : a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
}

export type Category = {
	name: string
	count: number
}

export async function getCategoryList(): Promise<Category[]> {
	const allBlogPosts = await getCollection<'posts'>('posts', ({ data }) => {
		return import.meta.env.PROD ? data.draft !== true : true
	})
	const count: { [key: string]: number } = {}
	allBlogPosts.map((post: { data: { category: string | number } }) => {
		if (!post.data.category) {
			const ucKey = i18n(I18nKey.uncategorized)
			count[ucKey] = count[ucKey] ? count[ucKey] + 1 : 1
			return
		}
		count[post.data.category] = count[post.data.category]
			? count[post.data.category] + 1
			: 1
	})

	const lst = Object.keys(count).sort((a, b) => {
		return a.toLowerCase().localeCompare(b.toLowerCase())
	})

	const ret: Category[] = []
	for (const c of lst) {
		ret.push({ name: c, count: count[c] })
	}
	return ret
}