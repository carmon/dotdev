CARMONDOTDEV
=================

Personal website built with htmx and vercel functions.

### Current flavor

At this point, the state-of-the-art proof-that-carmon-is-a-dev website here is using [HTMX]('http://htmx.org') to give some __updating__ capabilities to HTML tags. On the other side of the wire [Vercel]('http://vercel.com')'s magic is returning HTML over HTTP <3. Some HTML is getting this info onload, this is not ideal for HTMX, but is a little test of mine. I didn't know HTMX before, I liked it, is a funny little toy, just like Javascript. Toys inside toys.

### How to run

__Requirements:__ 
- node modules: `pnpm i`
- vercel cli: `pnpm i -g vercel`

__Run locally__
- On root dir run `vercel dev`