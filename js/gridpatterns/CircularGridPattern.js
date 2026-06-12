//
// CircularGridPattern.js
//
// Author-Hans Kellner
// Description-Concentric rings plus radial spokes centred on the image. Rings
//             and spokes are the preview lines; quad cells (triangles at the
//             centre) form the exported surface.
//
/*!
Copyright (C) 2015-2026 Hans Kellner: https://github.com/hanskellner/Fusion360Image2Surface
MIT License: See https://github.com/hanskellner/Fusion360Image2Surface/LICENSE.md
*/

(function () {

    var TWO_PI = Math.PI * 2;

    GridPatterns.register({

        id: 'circular',
        name: 'Circular',

        params: [
            { id: 'ringSpacing', label: 'Ring Spacing (px)', type: 'range',
              min: 4, max: 100, step: 1, value: 18, decimals: 0 },
            { id: 'spokes', label: 'Spokes', type: 'range',
              min: 6, max: 180, step: 1, value: 48, decimals: 0 }
        ],

        build: function (ctx) {

            var mb = new GridPatterns.MeshBuilder();

            var ringSpacing = Math.max(2, ctx.params.ringSpacing | 0);
            var spokes = Math.max(3, ctx.params.spokes | 0);

            var imgCx = ctx.imageWidth / 2;
            var imgCy = ctx.imageHeight / 2;

            // Inscribed circle keeps every sample inside the image.
            var maxR = Math.min(ctx.imageWidth, ctx.imageHeight) / 2;
            var rings = Math.floor(maxR / ringSpacing);
            if (rings < 1)
                return mb.result();

            // Radial neighbours are ringSpacing px apart -> meshStep mm apart.
            var scale = ctx.meshStep / ringSpacing;

            function addAt(px, py) {
                var s = ctx.sample(px, py);
                return mb.addVertex((px - imgCx) * scale, (imgCy - py) * scale, s.z, s.r, s.g, s.b);
            }

            // Precompute spoke angles.
            var cosA = new Float64Array(spokes);
            var sinA = new Float64Array(spokes);
            for (var a = 0; a < spokes; ++a) {
                var ang = TWO_PI * a / spokes;
                cosA[a] = Math.cos(ang);
                sinA[a] = Math.sin(ang);
            }

            var center = addAt(imgCx, imgCy);

            // ringIdx[r][a] -> vertex index, for r = 1..rings.
            var ringIdx = new Array(rings + 1);
            for (var r = 1; r <= rings; ++r) {
                ringIdx[r] = new Int32Array(spokes);
                var rad = r * ringSpacing;
                for (var i = 0; i < spokes; ++i)
                    ringIdx[r][i] = addAt(imgCx + rad * cosA[i], imgCy + rad * sinA[i]);
            }

            // --- Preview lines -------------------------------------------------
            // Concentric circles (closed polylines).
            for (var cr = 1; cr <= rings; ++cr) {
                var circle = new Int32Array(spokes + 1);
                for (var ci = 0; ci < spokes; ++ci)
                    circle[ci] = ringIdx[cr][ci];
                circle[spokes] = ringIdx[cr][0];
                mb.addPolyline(circle);
            }

            // Radial spokes (centre outward).
            for (var si = 0; si < spokes; ++si) {
                var spoke = new Int32Array(rings + 1);
                spoke[0] = center;
                for (var sr = 1; sr <= rings; ++sr)
                    spoke[sr] = ringIdx[sr][si];
                mb.addPolyline(spoke);
            }

            // --- Export faces --------------------------------------------------
            // Centre fan (triangles to ring 1).
            for (var ti = 0; ti < spokes; ++ti)
                mb.addFace([ center, ringIdx[1][ti], ringIdx[1][(ti + 1) % spokes] ]);

            // Quads between successive rings.
            for (var qr = 1; qr < rings; ++qr) {
                for (var qi = 0; qi < spokes; ++qi) {
                    var i2 = (qi + 1) % spokes;
                    mb.addFace([
                        ringIdx[qr][qi],
                        ringIdx[qr][i2],
                        ringIdx[qr + 1][i2],
                        ringIdx[qr + 1][qi]
                    ]);
                }
            }

            return mb.result();
        }
    });

})();
