//
// RectangularGridPattern.js
//
// Author-Hans Kellner
// Description-The original Image2Surface grid: a regular lattice of rows and
//             columns. One preview line per row and per column; quad faces for
//             the exported surface.
//
/*!
Copyright (C) 2015-2026 Hans Kellner: https://github.com/hanskellner/Fusion360Image2Surface
MIT License: See https://github.com/hanskellner/Fusion360Image2Surface/LICENSE.md
*/

(function () {

    GridPatterns.register({

        id: 'rectangular',
        name: 'Rectangular',

        // The rectangular grid's spacing IS the global "Pixels to Skip" control,
        // so keep that control visible for this pattern (hidden for the others,
        // which use their own cell-size / ring-spacing params instead).
        usesPixelStep: true,

        // No pattern-specific parameters - the global pixelStep / meshStep
        // fully describe a rectangular grid.
        params: [],

        build: function (ctx) {

            var mb = new GridPatterns.MeshBuilder();

            var xSteps = Math.floor(ctx.imageWidth / ctx.pixelStep);
            var ySteps = Math.floor(ctx.imageHeight / ctx.pixelStep);
            if (xSteps < 2 || ySteps < 2)
                return mb.result();

            var xHalf = Math.floor(xSteps / 2);
            var yHalf = Math.floor(ySteps / 2);

            // Build the vertex grid (row-major). idx[y][x] -> vertex index.
            // Note: image Y == 0 is the top, so mesh Y is flipped to keep the
            // surface upright (matches the original preview math).
            var idx = new Array(ySteps);
            for (var y = 0; y < ySteps; ++y) {
                idx[y] = new Int32Array(xSteps);
                for (var x = 0; x < xSteps; ++x) {
                    var s = ctx.sample(x * ctx.pixelStep, y * ctx.pixelStep);
                    var mx = (x - xHalf) * ctx.meshStep;
                    var myy = (yHalf - y - 1) * ctx.meshStep;
                    idx[y][x] = mb.addVertex(mx, myy, s.z, s.r, s.g, s.b);
                }
            }

            // Preview lines: one polyline per row (X lines)...
            for (var ry = 0; ry < ySteps; ++ry)
                mb.addPolyline(idx[ry]);

            // ...and one per column (Y lines).
            for (var cx = 0; cx < xSteps; ++cx) {
                var col = new Int32Array(ySteps);
                for (var cy = 0; cy < ySteps; ++cy)
                    col[cy] = idx[cy][cx];
                mb.addPolyline(col);
            }

            // Export faces: a quad per grid cell.
            for (var fy = 0; fy < ySteps - 1; ++fy) {
                for (var fx = 0; fx < xSteps - 1; ++fx) {
                    mb.addFace([
                        idx[fy][fx],
                        idx[fy][fx + 1],
                        idx[fy + 1][fx + 1],
                        idx[fy + 1][fx]
                    ]);
                }
            }

            return mb.result();
        }
    });

})();
