//
// HexagonalGridPattern.js
//
// Author-Hans Kellner
// Description-A honeycomb of flat-top hexagons. Each cell's six edges form a
//             preview outline; for export each hexagon is fan-triangulated from
//             a sampled centre vertex so the surface is closed.
//
/*!
Copyright (C) 2015-2026 Hans Kellner: https://github.com/hanskellner/Fusion360Image2Surface
MIT License: See https://github.com/hanskellner/Fusion360Image2Surface/LICENSE.md
*/

(function () {

    var SQRT3 = Math.sqrt(3);

    // Flat-top hexagon corner offsets (unit radius), angles 0,60,...,300 deg.
    var CORNERS = [];
    for (var i = 0; i < 6; ++i) {
        var a = Math.PI / 180 * (60 * i);
        CORNERS.push({ cos: Math.cos(a), sin: Math.sin(a) });
    }

    GridPatterns.register({

        id: 'hexagonal',
        name: 'Hexagonal',

        params: [
            { id: 'cellSize', label: 'Cell Radius (px)', type: 'range',
              min: 4, max: 100, step: 1, value: 18, decimals: 0 }
        ],

        build: function (ctx) {

            var mb = new GridPatterns.MeshBuilder();

            var R = Math.max(2, ctx.params.cellSize | 0);   // centre -> corner
            var spacingX = 1.5 * R;                         // between columns
            var spacingY = SQRT3 * R;                       // between rows

            var cols = Math.floor((ctx.imageWidth - 2 * R) / spacingX) + 1;
            var rows = Math.floor((ctx.imageHeight - spacingY) / spacingY) + 1;
            if (cols < 1 || rows < 1)
                return mb.result();

            // A hexagon edge is length R, so meshStep mm per R px of spacing.
            var scale = ctx.meshStep / R;
            var imgCx = ctx.imageWidth / 2;
            var imgCy = ctx.imageHeight / 2;

            // Map an image pixel to centred, Y-flipped mesh coordinates.
            function meshX(px) { return (px - imgCx) * scale; }
            function meshY(py) { return (imgCy - py) * scale; }

            // Add one vertex sampled at the given image pixel; return its index.
            function addAt(px, py) {
                var s = ctx.sample(px, py);
                return mb.addVertex(meshX(px), meshY(py), s.z, s.r, s.g, s.b);
            }

            for (var col = 0; col < cols; ++col) {
                var cx = R + col * spacingX;
                var colOffset = (col & 1) ? spacingY / 2 : 0;

                for (var row = 0; row < rows; ++row) {
                    var cy = spacingY / 2 + colOffset + row * spacingY;

                    // Six corner vertices (closed outline) + a centre vertex.
                    var ring = new Int32Array(6);
                    for (var k = 0; k < 6; ++k)
                        ring[k] = addAt(cx + R * CORNERS[k].cos, cy + R * CORNERS[k].sin);

                    var center = addAt(cx, cy);

                    // Preview: closed hexagon outline.
                    mb.addPolyline([ ring[0], ring[1], ring[2], ring[3], ring[4], ring[5], ring[0] ]);

                    // Export: fan of six triangles from the centre.
                    for (var t = 0; t < 6; ++t)
                        mb.addFace([ center, ring[t], ring[(t + 1) % 6] ]);
                }
            }

            return mb.result();
        }
    });

})();
