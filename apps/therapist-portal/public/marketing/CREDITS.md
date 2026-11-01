# Marketing image credits

Every image on the landing page is downloaded and self-hosted here. Nothing on
the page hotlinks a third-party host, and no image was generated.

| File | Source | Author | Licence | Used for |
|---|---|---|---|---|
| `window-light.webp` | [StockSnap.io — "Bedroom Clean"](https://stocksnap.io/photo/bedroom-clean-OE0F9BHXJQ) | Burst (Shopify) | [CC0 1.0](https://stocksnap.io/license) — public domain, commercial use, no attribution required | Waitlist band, beside the form |

## Notes

- `window-light.webp` is a crop (960×600, 8:5) of the 960 px original, colour
  nudged 8 % toward neutral so the whites sit with `--stone`. No other edit.
- **Indian-context gap, open.** The brief asks for photographs in an Indian
  context. The free libraries that permit commercial use and are reachable from
  the build host (Unsplash, Pexels, Openverse) block automated access, and
  Wikimedia Commons returned only documentary or unusable frames, so this is a
  calm, faceless window-light photograph that is not identifiably Indian. It is
  honest as light, not as place. Replacing it is one file: drop the new image in
  here, update the row above, and point `PHOTO` in
  `src/app/_marketing/Photo.tsx` at it. A commissioned photograph from an Indian
  photographer (a window, a balcony, a chai glass at 7am) is the correct fix.
- No image of a person is used, so there is no model release to record: the
  photo is a room.
