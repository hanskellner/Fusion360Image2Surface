//
// Utils.js
//
// Author-Hans Kellner
// Description-Utility functions.

/*!
Copyright (C) 2015 Hans Kellner: https://github.com/hanskellner/Fusion360Image2Surface
MIT License: See https://github.com/hanskellner/Fusion360Image2Surface/LICENSE.md
*/

var Utils = (function(my) {

    my.Vector3 = function ( x, y, z ) {
        this.x = x || 0;
        this.y = y || 0;
        this.z = z || 0;
    };

    my.Vector3.subtractVectors = function(v1, v2) {
        var vx = v1.x - v2.x;
        var vy = v1.y - v2.y;
        var vz = v1.z - v2.z;

        return new my.Vector3(vx, vy, vz);
    };

    my.Vector3.crossVectors = function(v1, v2) {
        var vx = v1.y * v2.z - v1.z * v2.y;
        var vy = v1.z * v2.x - v1.x * v2.z;
        var vz = v1.x * v2.y - v1.y * v2.x;

        return new my.Vector3(vx, vy, vz);
    };

    my.Vector3.prototype = {

        constructor: my.Vector3,

        add: function ( v ) {

    		var x = this.x, y = this.y, z = this.z;

    		this.x = x + v.x;
    		this.y = y + v.y;
            this.z = z + v.z;

    		return this;
    	},

        subtract: function ( v ) {

    		var x = this.x, y = this.y, z = this.z;

    		this.x = x - v.x;
    		this.y = y - v.y;
            this.z = z - v.z;

    		return this;
    	},

        cross: function ( v ) {

    		var x = this.x, y = this.y, z = this.z;

    		this.x = y * v.z - z * v.y;
    		this.y = z * v.x - x * v.z;
    		this.z = x * v.y - y * v.x;

    		return this;
    	},

        length: function () {
    		return Math.sqrt( this.x * this.x + this.y * this.y + this.z * this.z );
    	},

        normalize: function() {
            var len = this.length();
            if (len !== 0) {
                var inv = 1 / len;
    			this.x *= inv;
    			this.y *= inv;
    			this.z *= inv;
            }
            else {
                this.x = this.y = this.z = 0;
            }

            return this;
        }
    };

    my.Mesh = function (width, length) {
        this.width = width;
        this.length = length;
        this.vertices = [];
        this.vertNormals = [];
        this.faces = [];
    };

    my.Mesh.prototype = {

        constructor: my.Mesh,

        do: function ( ) {

    		return this;
    	}
    };

    function stringifyVector(vec)
    {
        return "" + vec.x.toFixed(6) + " " + vec.y.toFixed(6) + " " + vec.z.toFixed(6);
    };

    function stringifyVertexSTL(vec)
    {
        return "vertex "+stringifyVector(vec)+" \n";
    };

    function stringifyVertexOBJ(vec)
    {
        return "v "+stringifyVector(vec)+" \n";
    };

    function stringifyVertexNormalOBJ(vec)
    {
        return "vn "+stringifyVector(vec)+" \n";
    };

    function normalForFace(p1, p2, p3) {
        // vector from point 1 to point 2
        var p1p2x = p2.x - p1.x;
        var p1p2y = p2.y - p1.y;
        var p1p2z = p2.z - p1.z;

        // vector from point 1 to point 3
        var p1p3x = p3.x - p1.x;
        var p1p3y = p3.y - p1.y;
        var p1p3z = p3.z - p1.z;

        // normal vector from plane at point 1
        var nx = p1p2y*p1p3z - p1p2z*p1p3y;
        var ny = p1p2z*p1p3x - p1p2x*p1p3z;
        var nz = p1p2x*p1p3y - p1p2y*p1p3x;

        return new Utils.Vector3(nx, ny, nz);
    };

    // Create a Mesh for the height data.
    my.createMesh = function(heightData, width, length, step, isQuad) {

        var mesh = new Utils.Mesh(width, length);

        // Generate array of vertices and empty vertex normals.
        for (var y0 = 0; y0 < length; ++y0) {
             for (var x0 = 0; x0 < width; ++x0) {
                 mesh.vertices.push( new Utils.Vector3(x0*step, y0*step, heightData[x0 + y0*width]) );
                 mesh.vertNormals.push( new Utils.Vector3() );
            }
        }

        // Calculate vertex normals.
        // Use an area weighted normalized mesh
        // From: http://www.iquilezles.org/www/articles/normals/normals.htm
        for (var y1 = 0; y1 < length - 1; ++y1) {
             for (var x1 = 0; x1 < width - 1; ++x1) {

                // Calc the values for the two triangles that form a quad

                var iTL = x1 + y1 * width;
                var iTR = (x1 + 1) + y1 * width;
                var iBL = x1 + (y1 + 1) * width;
                var iBR = (x1 + 1) + (y1 + 1) * width;

                // Tri face 1 (a->b a->c)
                var v1ba = Utils.Vector3.subtractVectors(mesh.vertices[iTR], mesh.vertices[iTL]);
                var v1ca = Utils.Vector3.subtractVectors(mesh.vertices[iBL], mesh.vertices[iTL]);
                var vnorm1 = Utils.Vector3.crossVectors( v1ba, v1ca );

                mesh.vertNormals[iTL].add(vnorm1);
                mesh.vertNormals[iTR].add(vnorm1);
                mesh.vertNormals[iBL].add(vnorm1);

                // Tri face 2 (a->b a->c)
                var v2ba = Utils.Vector3.subtractVectors(mesh.vertices[iTR], mesh.vertices[iBR]);
                var v2ca = Utils.Vector3.subtractVectors(mesh.vertices[iBL], mesh.vertices[iBR]);
                var vnorm2 = Utils.Vector3.crossVectors( v2ba, v2ca );

                mesh.vertNormals[iBR].add(vnorm2);
                mesh.vertNormals[iTR].add(vnorm2);
                mesh.vertNormals[iBL].add(vnorm2);

                if (isQuad) {
                    mesh.faces.push([iTL,iTR,iBR,iBL]);
                }
                else {
                    mesh.faces.push([iTL,iTR,iBL]);
                    mesh.faces.push([iBR,iBL,iTR]);
                }
            }
        }

        // Now normalize all the vertex normals.
        for ( iv = 0, ivlen = width * length; iv < ivlen; ++iv ) {
            mesh.vertNormals[iv].normalize();
        }

        return mesh;
    };

    // Create a string formatted as an OBJ file
    my.createOBJString = function(name, mesh) {

        var objStr = "# Generated by image2surface for " + name + " \n\n";
        objStr += "# Units = Centimeters \n";
        objStr += "# Face count = " + mesh.faces.length + " \n";
        objStr += "# Vertext count = " + mesh.vertices.length + " \n\n";

        if (mesh && mesh.width > 2 && mesh.length > 2) {

            var vCount = mesh.width * mesh.length;

            // Generate the vertex and normal entries
            for (var iv = 0; iv < vCount; ++iv) {
                objStr += stringifyVertexOBJ( mesh.vertices[iv] );
                objStr += stringifyVertexNormalOBJ( mesh.vertNormals[iv] );
            }

            // Now generate the face entries
            for (var iface = 0; iface < mesh.faces.length; ++iface) {

                objStr += "f";

                var idxs = mesh.faces[iface];    // array of indicies of vertex/normals

                for (var i = 0; i < idxs.length; ++i) {

                    var idx = idxs[i] + 1;  // 1 based index

                    objStr += " " + idx + "//" + idx;
                }

                objStr += "\n";
            }
        }

        objStr += ("\n# End " + name + " \n");

        return objStr;
    };

    // Create a simple OBJ file
    my.createOBJSimple = function(heightData, width, length, step) {

        var objStr = "# Generated by image2surface \n";

        var p1 = { x: 0, y: 0, z: 0};
        var p2 = { x: 0, y: 0, z: 0};
        var p3 = { x: 0, y: 0, z: 0};
        var p4 = { x: 0, y: 0, z: 0};

        var vtxCount = 0;

        for (var y = 0; y < length - 2; ++y) {
             for (var x = 0; x < width - 2; ++x) {

                // Get the points of the face
                p1.x = x*step;
                p1.y = y*step;
                p1.z = heightData[x + y*width];

                p2.x = (x + 1)*step;
                p2.y = y*step;
                p2.z = heightData[(x + 1) + y*width];

                p3.x = (x + 1)*step;
                p3.y = (y + 1)*step;
                p3.z = heightData[(x + 1) + (y + 1)*width];

                p4.x = x*step;
                p4.y = (y + 1)*step;
                p4.z = heightData[x + (y + 1)*width];

                obj += stringifyVertexOBJ( p1 );
                obj += stringifyVertexOBJ( p2 );
                obj += stringifyVertexOBJ( p3 );
                obj += stringifyVertexOBJ( p4 );

                objStr += "f -4 -3 -2 -1 \n"; // relative
            }
        }

        objStr += ("# End \n");

        return objStr;
    };

    my.createSTLString = function(name, heightData, width, length, step) {

        var p1 = { x: 0, y: 0, z: 0};
        var p2 = { x: 0, y: 0, z: 0};
        var p3 = { x: 0, y: 0, z: 0};

        var stl = "solid " + name + " \n";

        for (var y = 0; y < length - 2; ++y) {
             for (var x = 0; x < width - 2; ++x) {

                 // Get the points of the face left
                 p1.x = x*step;
                 p1.y = y*step;
                 p1.z = heightData[x + y*width];
                 p2.x = (x + 1)*step;
                 p2.y = y*step;
                 p2.z = heightData[(x + 1) + y*width];
                 p3.x = x*step;
                 p3.y = (y + 1)*step;
                 p3.z = heightData[x + (y + 1)*width];

                stl += ("facet normal " + stringifyVector( normalForFace(p1,p2,p3) )+" \n");

                stl += ("outer loop \n");
                stl += stringifyVertexSTL( p1 );
                stl += stringifyVertexSTL( p2 );
                stl += stringifyVertexSTL( p3 );
                stl += ("endloop \n");

                stl += ("endfacet \n");

                // Get the points of the face right
                p1.x = (x + 1)*step;
                p1.y = y*step;
                p1.z = heightData[(x + 1) + y*width];
                p2.x = (x + 1)*step;
                p2.y = (y + 1)*step;
                p2.z = heightData[(x + 1) + (y + 1)*width];
                p3.x = x*step;
                p3.y = (y + 1)*step;
                p3.z = heightData[x + (y + 1)*width];

               stl += ("facet normal " + stringifyVector( normalForFace(p1,p2,p3) )+" \n");

               stl += ("outer loop \n");
               stl += stringifyVertexSTL( p1 );
               stl += stringifyVertexSTL( p2 );
               stl += stringifyVertexSTL( p3 );
               stl += ("endloop \n");

               stl += ("endfacet \n");
            }
        }

        stl += ("endsolid " + name + " \n");

        return stl;
    };

    return my;

})(Utils || {});
