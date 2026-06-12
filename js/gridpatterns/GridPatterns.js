//
// GridPatterns.js
//
// Author-Hans Kellner
// Description-Registry and shared helpers for the modular grid-pattern
//             generators used by Image2Surface.
//
/*!
Copyright (C) 2015-2026 Hans Kellner: https://github.com/hanskellner/Fusion360Image2Surface
MIT License: See https://github.com/hanskellner/Fusion360Image2Surface/LICENSE.md
*/

//
// A "grid pattern" decides how the loaded image is sampled into a network of
// lines and faces. The rectangular grid (rows + columns) is the original
// behaviour; hexagonal, triangular and circular patterns add others.
//
// Each pattern is a plain object registered with GridPatterns.register():
//
//   {
//       id:    'rectangular',          // unique key (stored in options / UI)
//       name:  'Rectangular',          // label shown in the dropdown
//       params: [ ...PARAM DESCRIPTORS... ],   // optional per-pattern controls
//       build: function (ctx) { ... }  // returns geometry (see below)
//   }
//
// build(ctx) is given a context object:
//
//   ctx.imageWidth, ctx.imageHeight   image pixel dimensions
//   ctx.pixelStep                     pixels skipped between samples
//   ctx.meshStep                      mm between adjacent vertices
//   ctx.maxHeight                     mm height for the brightest pixel
//   ctx.params                        { paramId: value } for THIS pattern
//   ctx.sample(px, py)                -> { z, r, g, b }  (height + color 0..1)
//
// and must return:
//
//   {
//       positions: Float32Array(n*3), // x,y mesh coords + z height per vertex
//       colors:    Float32Array(n*3), // r,g,b (0..1) per vertex
//       polylines: [ Int32Array, ... ]// vertex-index lists -> preview lines
//       faces:     [ [i,j,k(,l)], ...]// polygons -> exported OBJ surface
//   }
//
// `polylines` and `faces` index the SAME shared vertex pool. A pattern may add
// interior vertices (e.g. a hexagon/circle centroid) that appear only in
// `faces` so they make the export watertight without drawing extra lines.
//
// The GridPatterns.MeshBuilder helper below accumulates all four arrays.
//

var GridPatterns = (function (my) {

    var _patterns = {};     // id -> pattern object
    var _order = [];        // registration order (drives dropdown order)

    // Register a pattern. Re-registering the same id replaces it but keeps its
    // position in the dropdown order.
    my.register = function (pattern) {
        if (!pattern || !pattern.id)
            throw new Error('GridPatterns.register: pattern needs an id');
        if (!_patterns.hasOwnProperty(pattern.id))
            _order.push(pattern.id);
        _patterns[pattern.id] = pattern;
        return pattern;
    };

    my.get = function (id) {
        return _patterns[id] || null;
    };

    // All patterns in registration order.
    my.list = function () {
        return _order.map(function (id) { return _patterns[id]; });
    };

    // Id of the first-registered pattern (the default selection).
    my.defaultId = function () {
        return _order.length ? _order[0] : null;
    };

    //
    // MeshBuilder - small accumulator that grid patterns use to emit vertices,
    // preview polylines and export faces, then hand back the typed-array
    // geometry that Image2Surface expects.
    //
    my.MeshBuilder = function () {
        this._pos = [];     // flat x,y,z
        this._col = [];     // flat r,g,b
        this.polylines = [];
        this.faces = [];
    };

    my.MeshBuilder.prototype = {

        constructor: my.MeshBuilder,

        // Append a vertex; returns its index into the shared pool.
        addVertex: function (x, y, z, r, g, b) {
            var i = this._pos.length / 3;
            this._pos.push(x, y, z);
            this._col.push(r, g, b);
            return i;
        },

        // A preview line through the given vertex indices (open polyline).
        addPolyline: function (indices) {
            if (indices && indices.length >= 2)
                this.polylines.push(indices);
        },

        // An export face (triangle or quad) referencing vertex indices.
        addFace: function (indices) {
            if (indices && indices.length >= 3)
                this.faces.push(indices);
        },

        result: function () {
            return {
                positions: new Float32Array(this._pos),
                colors: new Float32Array(this._col),
                polylines: this.polylines,
                faces: this.faces
            };
        }
    };

    return my;

})(GridPatterns || {});
