<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://blob.coleoni.com/brand/blob.svg">
    <img src="https://blob.coleoni.com/brand/blob-dark.svg" alt="blob" height="56">
  </picture>
</p>

<p align="center">
  An animated blob avatar for React and any page: 12 shapes, 20 expressions and<br>
  14 animations, drawn live as SVG. Make yours at blob.coleoni.com, then drop it in.
</p>

<p align="center">
  <a href="https://blob.coleoni.com"><b>blob.coleoni.com</b></a> ·
  <a href="https://blob.coleoni.com/pt/">Português</a> ·
  <a href="https://github.com/c0le0ni/blob-avatar">GitHub</a> ·
  <a href="https://loaders.coleoni.com">Loaders</a> ·
  <a href="https://coleoni.com">Coleoni</a>
</p>

![Blob Avatar](https://blob.coleoni.com/og/en.jpg)

## Install

```bash
npm i blob-avatar
```

## React

```tsx
import { BlobAvatar } from "blob-avatar";

export function Mascot() {
  return <BlobAvatar shape="ghost" color="#8b5cf6" expression="happy" animation="idle.2.4,wink.1.6" gaze reaction />;
}
```

The first render is the blob as plain SVG, at its final size, so it renders on the
server and nothing moves when the page hydrates. After mount it starts to move.
Changing a prop redraws it in place, without starting the cycle over. The entry is
marked `"use client"`, so it works from a server component too. React 18 or later.

The easiest way to pick the props is to design the blob at
[blob.coleoni.com](https://blob.coleoni.com): "Copy embed code" writes the same
names, and the address bar's hash works as `state`:

```tsx
<BlobAvatar state="v=2&shape=heart&color=e152b0&expr=happy&anim=idle.2.4,wink.1.6&seed=1" size={96} />
```

## Props

<!-- props:start -->

| Prop | Type | Default | |
| --- | --- | --- | --- |
| `shape` | `Shape` | `"circle"` | The outline of the body |
| `color` | `string` | `"#aefa0e"` | The body color: a six-digit hex color, with or without `#` |
| `expression` | `Expression` | `"neutral"` | The face |
| `animation` | `string \| Clip[]` | every animation once | The cycle, played in order and looped: `"idle.2.4,wink.1.6"` as in the share link, or a list of clips |
| `seed` | `number \| string` | `1` | Changes when it blinks and where it glances: a whole number, or 1 to 6 characters of `0-9a-z` as in the share link |
| `size` | `number \| string` | `160` | Width and height: pixels, or any CSS length |
| `gaze` | `boolean` | `false` | The eyes follow the cursor |
| `paused` | `boolean` | `false` | Holds still |
| `reaction` | `` boolean \| Anim \| `${Anim}.${number}` `` | `false` | A click makes it wink and hop (`true`), or plays the animation it names, with seconds if you like (`"exclaim"`, `"orbit.2"`); with a `tabIndex`, Enter and Space too |
| `state` | `string \| BlobState` |  | A whole share-link hash (`"v=2&shape=…"`) or a state; the props above override its parts |
| any other | | | `className`, `style`, `aria-label` (by default "Blob avatar"), `tabIndex`, event handlers and the rest go to the outer `<span>` |

| Type | |
| --- | --- |
| `Shape` | `circle` `pebble` `squircle` `capsule` `triangle` `diamond` `hexagon` `star` `cloud` `droplet` `heart` `ghost` |
| `Expression` | `neutral` `attentive` `focused` `surprised` `excited` `happy` `laughing` `wink` `angry` `sad` `worried` `scared` `suspicious` `confused` `curious` `proud` `smug` `shy` `unimpressed` `sleepy` |
| `Anim` | `idle` 2.4 s, `thinking` 2.6 s, `wink` 1.6 s, `wide` 1.8 s, `alert` 2.4 s, `notification` 2.2 s, `exclaim` 2 s, `sleep` 2.4 s, `egg` 1.8 s, `hexagon` 1.6 s, `play` 2 s, `orbit` 3.4 s, `burst` 2.6 s, `comet` 2.4 s |
| `Clip` | `{ anim: Anim; dur: number; }`, `dur` in seconds |

<!-- props:end -->

A value that is not on these lists is ignored, so the default (or the value from
`state`) stays, and an unknown name in `animation` is skipped. In `animation`,
seconds go from 0.4 to 10, one decimal, and a name on its own plays for the
length above.

## Without React

The same avatar as a custom element, for any page or framework:

```js
import "blob-avatar/element";
```

```html
<blob-avatar shape="circle" color="#aefa0e" expression="happy"
             animation="idle.2.4,wink.1.6" size="160" gaze reaction></blob-avatar>
```

The attributes are the props above (`seed` as 1 to 6 characters of `0-9a-z`, `size`
in pixels), and changing one changes the blob right away. With no build step, load
it from a script tag instead:

```html
<script src="https://blob.coleoni.com/v2/embed.js" defer></script>
```

The element works under a strict Content Security Policy (no inline styles, no
`eval`). Every attribute is in the
[main README](https://github.com/c0le0ni/blob-avatar#on-your-site).

## How it behaves

- **One loop for every avatar** on the page, React or element, and only the ones on
  screen are drawn.
- **Reduced motion:** for visitors who ask their system for less motion, it holds
  still (a click on a reacting avatar then shows the reaction's pose for a moment,
  without moving).
- **Accessible name:** `role="img"` and the label "Blob avatar". Give it an
  `aria-label` of your own to say something else, or `aria-hidden` next to a text
  that already says who it is.
- **Keyboard:** with `reaction` and a `tabIndex`, Enter and Space play the reaction
  too.
- **The same picture everywhere:** the drawing is a pure function of the props and
  the time, so it matches the PNG, GIF and SVG exports from the site.

The package's version follows the embed's: 2.x reads the same names as
`/v2/embed.js`.

## License

MIT © Coleoni. Source, issues and the editor:
[github.com/c0le0ni/blob-avatar](https://github.com/c0le0ni/blob-avatar) ·
[blob.coleoni.com](https://blob.coleoni.com).
