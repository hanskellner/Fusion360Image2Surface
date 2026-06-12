//
// TriangularGridPattern.js
//
// Author-Hans Kellner
// Description-A triangular (isometric) lattice. Vertices sit on offset rows so
//             every cell is an equilateral triangle. Three families of preview
//             lines (rows + two zig-zag diagonals); triangle faces for export.
//
/*!
Copyright (C) 2015-2026 Hans Kellner: https://github.com/hanskellner/Fusion360Image2Surface
MIT License: See https://github.com/hanskellner/Fusion360Image2Surface/LICENSE.md
*/

(function () {

    var SQRT3_2 = Math.sqrt(3) / 2;   // row-to-row spacing factor

    GridPatterns.register({

        id: 'triangular',
        name: 'Triangular',

        params: [
            { id: 'cellSize', label: 'Cell Size (px)', type: 'range',
              min: 4, max: 100, step: 1, value: 14, decimals: 0 }
        ],

        build: function (ctx) {

            var mb = new GridPatterns.MeshBuilder();

            var dx = Math.max(2, ctx.params.cellSize | 0);  // horizontal spacing
            var dy = dx * SQRT3_2;                          // vertical spacing

            var cols = Math.floor((ctx.imageWidth - dx / 2) / dx);
            var rows = Math.floor(ctx.imageHeight / dy);
            if (cols < 2 || rows < 2)
                return mb.result();

            // Adjacent vertices are dx px apart and must end up meshStep mm
            // apart, so the image->mesh scale is meshStep / dx (keeps meshStep
            // meaning "mm between neighbouring vertices", as for the rect grid).
            var scale = ctx.meshStep / dx;
            var cx = ctx.imageWidth / 2;
            var cy = ctx.imageHeight / 2;

            // Vertex grid: odd rows are shifted right by half a cell.
            var idx = new Array(rows);
            for (var r = 0; r < rows; ++r) {
                idx[r] = new Int32Array(cols);
                var offset = (r & 1) ? dx / 2 : 0;
                var py = r * dy;
                for (var c = 0; c < cols; ++c) {
                    var px = c * dx + offset;
                    var s = ctx.sample(px, py);
                    var mx = (px - cx) * scale;
                    var myy = (cy - py) * scale;
                    idx[r][c] = mb.addVertex(mx, myy, s.z, s.r, s.g, s.b);
                }
            }

            var v = function (c, r) { return idx[r][c]; };

            // --- Preview lines -------------------------------------------------
            // Horizontal rows.
            for (var hr = 0; hr < rows; ++hr)
                mb.addPolyline(idx[hr]);

            // Near-vertical columns: index c at every row (real triangle edges).
            for (var vc = 0; vc < cols; ++vc) {
                var colLine = new Int32Array(rows);
                for (var vr = 0; vr < rows; ++vr)
                    colLine[vr] = idx[vr][vc];
                mb.addPolyline(colLine);
            }

            // Zig-zag diagonals: oscillate between column k (even rows) and
            // k-1 (odd rows), tracing the remaining triangle edge per strip.
            for (var k = 1; k < cols; ++k) {
                var zig = new Int32Array(rows);
                for (var zr = 0; zr < rows; ++zr)
                    zig[zr] = idx[zr][(zr & 1) ? (k - 1) : k];
                mb.addPolyline(zig);
            }

            // --- Export faces (triangles) -------------------------------------
            for (var fr = 0; fr < rows - 1; ++fr) {
                var even = (fr & 1) === 0;
                for (var fc = 0; fc < cols - 1; ++fc) {
                    if (even) {
                        mb.addFace([ v(fc, fr),     v(fc + 1, fr),     v(fc, fr + 1) ]);
                        mb.addFace([ v(fc + 1, fr), v(fc + 1, fr + 1), v(fc, fr + 1) ]);
                    } else {
                        mb.addFace([ v(fc, fr),     v(fc, fr + 1),     v(fc + 1, fr + 1) ]);
                        mb.addFace([ v(fc, fr),     v(fc + 1, fr),     v(fc + 1, fr + 1) ]);
                    }
                }
            }

            return mb.result();
        }
    });

})();
