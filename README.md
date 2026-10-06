<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/brand/blob.svg">
    <img src="public/brand/blob-dark.svg" alt="blob" height="56">
  </picture>
</p>

<p align="center">
  Make your own animated blob avatar: pick a shape, a face, colors and moves,<br>
  then export it or put it on your site. Free, no sign-up, all in your browser.
</p>

<p align="center">
  <a href="https://blob.coleoni.com"><b>blob.coleoni.com</b></a> ·
  <a href="https://blob.coleoni.com/pt/">Português</a> ·
  <a href="https://skills.coleoni.com">Coleoni Skills</a>
</p>

![Blob Avatar](public/og/en.jpg)

## What you can make

- **10 shapes**, **9 eye styles** (drawn on top or cut out of the body) and **16 expressions**.
- **Any color**, with a solid or gradient background, or none.
- **A montage** of up to 8 moves out of 15 (hop, jelly, spin, sleep, love, pop…). It loops without a seam.
- **Exports:** PNG at profile sizes (GitHub 460, Slack 512, X and LinkedIn 400, Discord 128, or any size), square or round; still SVG; animated SVG; GIF.
- **A share link:** the whole avatar lives in the URL, so the address bar is always a link to it.

## On your site

```html
<script src="https://blob.coleoni.com/embed.js" defer></script>

<blob-avatar shape="bean" color="#aefa0e" eyes="block" expression="happy"
             animation="idle.3,hop.1.6" size="160" gaze></blob-avatar>
```

The Embed tab in the editor writes this snippet for the blob you made.

| Attribute | Values |
| --- | --- |
| `shape` | `orb` `bean` `block` `pill` `tri` `hex` `puff` `drop` `ghost` `star` |
| `color` | any hex color |
| `eyes` | `block` `dot` `pill` `oval` `pixel` `heart` `star` `cross` `arc` |
| `mode` | `ink` (default) or `hole` (eyes cut out) |
| `eyec` | `auto` (default, readable on any color) or a hex color |
| `expression` | `neutral` `happy` `joy` `sleepy` `sad` `angry` `surprised` `wink` `love` `starry` `dizzy` `focused` `suspicious` `shy` `worried` `smug` |
| `animation` | up to 8 `move.seconds` items, comma separated. Moves: `idle` `bounce` `hop` `jelly` `float` `spin` `nod` `shake` `lean` `peek` `sleep` `love` `excited` `dizzy` `pop` |
| `bg` | `none`, `solid.rrggbb` or `linear.rrggbb.rrggbb.angle` |
| `seed` | 1 to 6 characters of `0-9a-z`; changes when it blinks and where it glances |
| `size` | pixels (or size the element with CSS) |
| `gaze` | follow the cursor |
| `paused` | hold still |
| `state` | a whole share-link hash, in place of the attributes above |

Changing an attribute changes the blob right away. The element works under a strict
Content Security Policy (no inline styles, no `eval`), draws only while it is on
screen, and holds still for visitors who prefer reduced motion. About 11 KB gzipped.

## How it works

Everything is drawn from scratch, every frame, by a small engine with no
dependencies (`src/engine`).

- **One structure for every outline.** The body, the eyes, the cheeks and the little
  hearts and stars are closed curves with a fixed number of points. Any shape can
  turn into any other, and every path keeps the same commands, which is what lets the
  animated SVG hand its keyframes to the browser to interpolate.
- **Expressions are data.** Each one sets the size, tilt and position of each eye and
  where its lids are; the eye's points are pressed against the lids.
- **Moves are functions of time** that start and end at rest. The montage crossfades
  from one to the next, and every period (breathing, blinking, glances) is fitted to
  the loop, so exports loop exactly.
- **`frame(state, t)` is pure:** the same avatar at the same moment is always the same
  picture, in the editor, in the GIF and on your site.

The GIF encoder is part of the project too: a median-cut palette, LZW compression
and frame differences, running in a Worker.

## Develop

```bash
npm install
npm run dev      # http://localhost:5320
npm test
npm run build    # the site and embed.js in dist/
```

`lab.html` shows every shape, eye, expression and move at once, and
`embed-test.html` runs `<blob-avatar>` under a strict CSP (after a build).

## License

MIT © Coleoni. One of Coleoni's free tools, next to [Coleoni Skills](https://skills.coleoni.com).
