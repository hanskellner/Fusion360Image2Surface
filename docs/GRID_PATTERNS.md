# Grid Patterns

The Image2Surface preview and exported mesh are produced by a **grid pattern**:
a module that decides how the loaded image is sampled into a network of lines
(for the preview) and faces (for the OBJ export). The user picks the pattern
from the *Grid Pattern* dropdown in the controls panel.

Patterns are modular. Each lives in its own file under `js/gridpatterns/`, is
loaded with a plain `<script>` tag, and self-registers with the global
`GridPatterns` registry. There is no bundler — this mirrors how `THREE`,
`Utils`, etc. are already exposed as globals.

## Shipped patterns

| File | Id | Description |
|------|----|-------------|
| `RectangularGridPattern.js` | `rectangular` | Rows + columns (the default). |
| `HexagonalGridPattern.js`   | `hexagonal`   | Honeycomb of flat-top hexagons. |
| `TriangularGridPattern.js`  | `triangular`  | Isometric / triangular lattice. |
| `CircularGridPattern.js`    | `circular`    | Concentric rings + radial spokes. |

`GridPatterns.js` itself holds the registry and the `MeshBuilder` helper; it is
**not** a pattern.

## The generator contract

A pattern is a plain object passed to `GridPatterns.register()`:

```js
GridPatterns.register({
    id:    'mypattern',          // unique key (stored in options + the <select>)
    name:  'My Pattern',         // label shown in the dropdown
    params: [ /* parameter descriptors, see below */ ],
    build: function (ctx) { /* ... */ return meshBuilder.result(); }
});
```

Registration order drives the dropdown order; the first-registered pattern is
the default selection.

### `params` — per-pattern controls

Optional. Each descriptor renders a control under the dropdown when the pattern
is active, rebuilt automatically when the pattern changes. Values are persisted
per-pattern in `_guiOptions.patternParams[id]` and passed back via `ctx.params`.

```js
// range
{ id: 'cellSize', label: 'Cell Size (px)', type: 'range',
  min: 4, max: 100, step: 1, value: 14, decimals: 0 }

// toggle
{ id: 'staggered', label: 'Staggered', type: 'toggle', value: true }
```

`value` is the default. `decimals` controls the value badge formatting for
ranges. Use an empty array (or omit `params`) for patterns with no extra
controls (e.g. the rectangular grid).

### `build(ctx)`

Called to (re)generate geometry. `ctx` provides:

| Field | Meaning |
|-------|---------|
| `ctx.imageWidth`, `ctx.imageHeight` | Image pixel dimensions. |
| `ctx.pixelStep` | Global "pixels to skip" (the rectangular grid's spacing). |
| `ctx.meshStep` | Millimetres between neighbouring vertices. |
| `ctx.maxHeight` | Millimetres of height for the brightest pixel. |
| `ctx.params` | `{ paramId: value }` for **this** pattern. |
| `ctx.sample(px, py)` | Returns `{ z, r, g, b }` — height (mm) + color (0..1), clamped to the image. |

`build` must return the object produced by `GridPatterns.MeshBuilder.result()`:

```js
{
    positions: Float32Array(n*3),  // x, y mesh coords + z height, per vertex
    colors:    Float32Array(n*3),  // r, g, b (0..1), per vertex
    polylines: [ Int32Array, ... ],// vertex-index lists -> one THREE.Line each (preview)
    faces:     [ [i,j,k(,l)], ... ]// polygons (tris/quads) -> exported OBJ surface
}
```

`polylines` and `faces` index the **same** shared vertex pool. A pattern may add
interior vertices used only by `faces` (e.g. a hexagon/circle centroid for
fan-triangulation) so the export is closed without drawing extra preview lines.

### `MeshBuilder` helper

Accumulates all four arrays so a pattern needn't manage typed arrays directly:

```js
var mb = new GridPatterns.MeshBuilder();
var i0 = mb.addVertex(x, y, z, r, g, b);  // returns the vertex index
var i1 = mb.addVertex(/* ... */);
mb.addPolyline([ i0, i1, /* ... */ ]);     // preview line (>= 2 indices)
mb.addFace([ i0, i1, i2 ]);                // export face (tri or quad)
return mb.result();
```

## Coordinate convention

- Image `y = 0` is the **top**; mesh `y` is flipped so the surface is upright.
- The mesh is centred on the origin.
- Scale the image→mesh mapping so that vertices one spacing apart in pixels end
  up `meshStep` mm apart. The shipped non-rectangular patterns compute
  `scale = meshStep / spacingPx` (where `spacingPx` is the pattern's cell size /
  ring spacing) and place vertices at `((px - imageWidth/2) * scale,
  (imageHeight/2 - py) * scale)`. This keeps `meshStep` meaning the same thing
  across every pattern.

## Performance / fast path

`createLines()` keeps a *structural signature* (pattern id + image dimensions +
`pixelStep` + the pattern's params). When only height/color parameters change
(`meshStep`, `maxHeight`, `invert`, `smoothing`, `absolute`), the signature is
unchanged: `build()` is re-run and its positions/colors are copied into the
existing line buffers in place rather than rebuilding all the `THREE.Line`
objects. Keep `build()` deterministic for a given signature so this holds.

## Adding a pattern

1. Create `js/gridpatterns/MyPattern.js` calling `GridPatterns.register({...})`.
2. Add a `<script src="js/gridpatterns/MyPattern.js?v=N">` tag in
   `Image2Surface.html`, **before** `js/image2surface.js` and after
   `GridPatterns.js`.
3. Bump the `?v=` cache-buster on the changed files (Fusion's CEF caches them).
