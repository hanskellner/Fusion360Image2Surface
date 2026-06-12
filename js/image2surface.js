//Author-Hans Kellner
//Description-Generate a surface from an image in Autodesk Fusion.

/*!
Copyright (C) 2015-2026 Hans Kellner: https://github.com/hanskellner/Fusion360Image2Surface
MIT License: See https://github.com/hanskellner/Fusion360Image2Surface/LICENSE.md
*/

import * as THREE from 'three';
import { TrackballControls } from 'three/addons/controls/TrackballControls.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

var _inputImage,
    _imageWidth,
    _imageHeight,
    _imageFileName,
    _pixels,
    _content,
    _lineGroup,
    _lineHolder,
    _camera,
    _scene,
    _renderer,
    _material,
    _canvas,
    _context,
    _controls,
    _guiOptions,
    _lines,         // descriptors for each preview line (3.3 incremental updates)
    _structSig,     // structural signature of the current geometry (pattern + params + image dims)
    _geomBounds;    // XYZ bounds of the current geometry, for camera framing

// Use TrackballControls instead of OrbitControls.
var USE_TRACKBALL_CONTROLS = true;

// Default camera distance in meters
var DEFAULT_CAMERA_DISTANCE = 5;

// Images larger than this (in either dimension) are downsampled on load.
var MAX_IMAGE_DIMENSION = 1600;

// Active document length unit, pushed from Fusion via setDocumentUnit(). The
// length-based controls (Stepover, Max Height) are labelled, scaled and
// interpreted in this unit; the OBJ is authored numerically in it and imported
// with the matching MeshUnits on the Python side. Defaults to millimeters for
// standalone/browser use (no Fusion host).
var _docUnit = 'mm';

// Per-unit ranges for the length-based controls. Each row is roughly the same
// physical envelope (stepover up to ~10 mm, max height up to ~50 mm), so the
// sliders stay realistic regardless of the document's units. Pixels to Skip and
// the patterns' pixel/count parameters are unit-independent and not listed.
var UNIT_DEFS = {
    mm: { label: 'mm', decimals: 1, meshStep: { min: 0.1,   max: 10,   step: 0.1,   value: 1     }, maxHeight: { min: 0.1,   max: 50,  step: 0.1,   value: 5    } },
    cm: { label: 'cm', decimals: 2, meshStep: { min: 0.01,  max: 1,    step: 0.01,  value: 0.1   }, maxHeight: { min: 0.01,  max: 5,   step: 0.01,  value: 0.5  } },
    m:  { label: 'm',  decimals: 3, meshStep: { min: 0.001, max: 0.1,  step: 0.001, value: 0.01  }, maxHeight: { min: 0.001, max: 0.5, step: 0.001, value: 0.05 } },
    in: { label: 'in', decimals: 3, meshStep: { min: 0.005, max: 0.5,  step: 0.005, value: 0.05  }, maxHeight: { min: 0.005, max: 2,   step: 0.005, value: 0.2  } },
    ft: { label: 'ft', decimals: 3, meshStep: { min: 0.001, max: 0.05, step: 0.001, value: 0.005 }, maxHeight: { min: 0.001, max: 0.2, step: 0.001, value: 0.02 } }
};

// Millimeters per unit, used to convert control values when the document's
// units change so the physical size is preserved.
var MM_PER_UNIT = { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 };

function hasWebGL() {
    try {
        var canvas = document.createElement('canvas');
        return !!(window.WebGLRenderingContext &&
            (canvas.getContext('webgl2') || canvas.getContext('webgl')));
    } catch (e) {
        return false;
    }
}

function showWebGLMessage(parent) {
    var element = document.createElement('div');
    element.style.fontFamily = 'monospace';
    element.style.fontSize = '13px';
    element.style.textAlign = 'center';
    element.style.background = '#fff';
    element.style.color = '#000';
    element.style.padding = '1.5em';
    element.style.width = '400px';
    element.style.margin = '5em auto 0';
    element.innerHTML = window.WebGLRenderingContext ? [
        'Your graphics card does not seem to support <a href="http://khronos.org/webgl/wiki/Getting_a_WebGL_Implementation" style="color:#000">WebGL</a>.<br />',
        'Find out how to get it <a href="http://get.webgl.org/" style="color:#000">here</a>.'
    ].join('\n') : [
        'Your browser does not seem to support <a href="http://khronos.org/webgl/wiki/Getting_a_WebGL_Implementation" style="color:#000">WebGL</a>.<br/>',
        'Find out how to get it <a href="http://get.webgl.org/" style="color:#000">here</a>.'
    ].join('\n');
    parent.appendChild(element);
}

function currentUnitDef() {
    return UNIT_DEFS[_docUnit] || UNIT_DEFS.mm;
}

// Convert a length control's value from one unit to another, then clamp to the
// destination unit's range and snap to its slider step.
function convertLength(value, fromUnit, toUnit, paramId) {
    var converted = value * MM_PER_UNIT[fromUnit] / MM_PER_UNIT[toUnit];
    var r = UNIT_DEFS[toUnit][paramId];
    if (converted < r.min) converted = r.min;
    else if (converted > r.max) converted = r.max;
    converted = Math.round(converted / r.step) * r.step;   // snap to a valid slider value
    return parseFloat(converted.toFixed(6));                // trim floating-point dust
}


var GuiOptions = function() {
    this.pixelStep = 5;	// pixel step over in the image
    this.meshStep = 1;	// amount in mms to step over mesh per pixel
    this.maxHeight = 5; // max mesh height in mms for brightest image color
    this.invert = false; // true to invert height values (dark == highest)
    this.smoothing = true; //turn on smoothing
    this.absolute = false;
    this.gridPattern = 'rectangular';  // active GridPatterns id
    this.patternParams = {};           // { patternId: { paramId: value } } - per-pattern controls
};

// Initialize the page
document.addEventListener('DOMContentLoaded', function() {

    _guiOptions = new GuiOptions();

    // Parameters are now driven by the daisyUI range/toggle inputs in the
    // controls panel (replaces the former DAT.GUI panel).
    bindControls();

    // Populate the grid-pattern dropdown and its per-pattern parameter controls.
    initGridPatternUI();

    window.addEventListener('resize', onWindowResize);

    if (typeof(FileReader) != "undefined") {

        setLoadPromptVisible(true);

        document.getElementById('getimagefile').addEventListener('change', readImageURL, true);

        // Click the empty-view overlay to open the file picker.
        var loadPrompt = document.getElementById('loadprompt');
        if (loadPrompt) {
            loadPrompt.addEventListener('click', function() {
                document.getElementById('getimagefile').click();
            });
        }
    }

    // stop the user getting a text cursor
    document.onselectstart = function() {
        return false;
    };

    _content = document.getElementById("content");

    if (!hasWebGL()) {
        var promptEl = document.getElementById('loadprompt');
        promptEl.innerHTML = '';
        showWebGLMessage(promptEl);
    }
    else {
        _camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 5000);
        _camera.position.z = DEFAULT_CAMERA_DISTANCE;

        _renderer = new THREE.WebGLRenderer({
            antialias: true
        });
        _renderer.sortObjects = false;

        _content.appendChild(_renderer.domElement);

        initViewControls();

        _scene = new THREE.Scene();

        _lineHolder = new THREE.Object3D();
        _scene.add(_lineHolder);
    }

    onWindowResize();
    animate();
});

// Descriptors for the parameter controls in the panel, bound to _guiOptions.
// 'decimals' is how many fraction digits to show in the value badge.
// 'unit: true' marks a length-based control whose range/decimals come from the
// active document unit (UNIT_DEFS) rather than the fixed 'decimals' value.
var PARAM_CONTROLS = [
    { id: 'pixelStep', type: 'range',  decimals: 0 },
    { id: 'meshStep',  type: 'range',  unit: true },
    { id: 'maxHeight', type: 'range',  unit: true },
    { id: 'invert',    type: 'toggle' },
    { id: 'smoothing', type: 'toggle' },
    { id: 'absolute',  type: 'toggle' }
];

// Wire the panel controls to _guiOptions and regenerate the preview on change.
function bindControls() {
    PARAM_CONTROLS.forEach(function(p) {
        var el = document.getElementById('ctrl-' + p.id);
        if (!el) return;

        if (p.type === 'range') {
            el.addEventListener('input', function() {
                _guiOptions[p.id] = parseFloat(el.value);
                updateParamLabel(p);
                createLines();
            });
        }
        else { // toggle / checkbox
            el.addEventListener('change', function() {
                _guiOptions[p.id] = el.checked;
                createLines();
            });
        }
    });

    syncControlsFromOptions();
}

// Push the current _guiOptions values into the DOM controls and value badges.
function syncControlsFromOptions() {
    PARAM_CONTROLS.forEach(function(p) {
        var el = document.getElementById('ctrl-' + p.id);
        if (!el) return;

        if (p.type === 'range') {
            if (p.unit) applyUnitRangeToControl(p);
            el.value = _guiOptions[p.id];
            updateParamLabel(p);
        }
        else {
            el.checked = !!_guiOptions[p.id];
        }
    });
}

// Set a length control's slider min/max/step from the active unit definition.
function applyUnitRangeToControl(p) {
    var r = currentUnitDef()[p.id];
    var el = document.getElementById('ctrl-' + p.id);
    if (el && r) {
        el.min = r.min;
        el.max = r.max;
        el.step = r.step;
    }
}

// Refresh the small value badge next to a range control. Length controls use
// the active unit's decimal precision; others use their fixed 'decimals'.
function updateParamLabel(p) {
    var label = document.getElementById('val-' + p.id);
    if (!label) return;
    var decimals = p.unit ? currentUnitDef().decimals : p.decimals;
    label.textContent = Number(_guiOptions[p.id]).toFixed(decimals);
}

// Apply the document's length unit (pushed from Fusion) to the UI: relabel the
// length controls, rescale their slider ranges, and convert their current
// values from the previous unit so the physical size is preserved. Idempotent
// on a repeated push of the same unit (a palette re-show won't alter values).
function setDocumentUnit(unit) {
    if (!UNIT_DEFS[unit]) unit = 'mm';   // fallback for unexpected strings

    var fromUnit = _docUnit;
    if (unit !== fromUnit) {
        _guiOptions.meshStep  = convertLength(_guiOptions.meshStep,  fromUnit, unit, 'meshStep');
        _guiOptions.maxHeight = convertLength(_guiOptions.maxHeight, fromUnit, unit, 'maxHeight');
    }

    _docUnit = unit;

    var def = currentUnitDef();
    var lblMesh = document.getElementById('label-meshStep');
    if (lblMesh) lblMesh.textContent = 'Stepover (' + def.label + ')';
    var lblMax = document.getElementById('label-maxHeight');
    if (lblMax) lblMax.textContent = 'Max Height (' + def.label + ')';

    syncControlsFromOptions();

    // The geometry scale changed with the unit, so rebuild and reframe.
    if (_inputImage) {
        createLines();
        //fitView();
    }
}

function resetGUIOptions() {
    var def = currentUnitDef();
    _guiOptions.pixelStep = 5;
    _guiOptions.meshStep = def.meshStep.value;
    _guiOptions.maxHeight = def.maxHeight.value;
    _guiOptions.invert = false;
    _guiOptions.smoothing = true; //turn on smoothing
    _guiOptions.absolute = false;

    syncControlsFromOptions();
}

function readImageURL() {
    var file = document.getElementById("getimagefile").files[0];
    loadImageFile(file);
}

function loadImageFile(file) {
    if (file == null)
        return;

    var fileType = file.type;
    if (!fileType.match(/image\/\w+/)) {
        alert("Only image files supported.");
        return;
    }

    var reader = new FileReader();
    reader.onload = function() {

        _inputImage = new Image();
        _inputImage.src = reader.result;

        _inputImage.onload = function() {
            onImageLoaded();
        };
    };

    reader.readAsDataURL(file);

    _imageFileName = file.name.replace(/^.*[\\\/]/, '');	// Just want filename, no path
    document.getElementById('imagefilename').textContent = _imageFileName;
}

// Called from html page
function clearImageLoaded() {
    _inputImage = null;
    _imageFileName = null;

    document.getElementById('imagefilename').textContent = 'No image loaded';
    document.getElementById('imagedim').textContent = '\u2014';

    var fileInput = document.getElementById('getimagefile');
    if (fileInput)
        fileInput.value = '';

    if (_lineGroup != null) {
        _lineHolder.remove(_lineGroup);
        disposeLines();
        _lineGroup = null;
    }

    // Force a full rebuild next time an image is loaded.
    _lines = [];
    _structSig = null;
    _geomBounds = null;
    updateSurfaceDims();

    setLoadPromptVisible(true);

    // Reset camera/controls to the startup frame.
    _camera.position.set(0, 0, DEFAULT_CAMERA_DISTANCE);
    _camera.up.set(0, 1, 0);
    //_camera.near = 0.1;
    //_camera.far = 5000;
    _camera.updateProjectionMatrix();

    initViewControls();
}

function onImageLoaded() {

    resetGUIOptions();

    var srcWidth = _inputImage.width;
    var srcHeight = _inputImage.height;

    // Guard against very large images. Anything bigger than
    // MAX_IMAGE_DIMENSION can make the palette unresponsive (or crash Fusion),
    // so downsample it on the way in and let the user know.
    var scale = 1.0;
    if (srcWidth > MAX_IMAGE_DIMENSION || srcHeight > MAX_IMAGE_DIMENSION) {
        scale = MAX_IMAGE_DIMENSION / Math.max(srcWidth, srcHeight);
        alert("Image is large (" + srcWidth + " x " + srcHeight + ").\n" +
              "It will be downsampled to keep the tool responsive.");
    }

    _imageWidth = Math.max(1, Math.round(srcWidth * scale));
    _imageHeight = Math.max(1, Math.round(srcHeight * scale));

    document.getElementById('imagedim').textContent = _imageWidth + ' x ' + _imageHeight;

    _canvas	= document.createElement('canvas');
    _canvas.width = _imageWidth;
    _canvas.height = _imageHeight;

    _context = _canvas.getContext('2d');
    _context.drawImage(_inputImage, 0, 0, _imageWidth, _imageHeight);

    // Keep the typed Uint8ClampedArray directly - no copy into a plain array.
    _pixels	= _context.getImageData(0, 0, _imageWidth, _imageHeight).data;

    setLoadPromptVisible(false); // Hide while editing

    createLines();
    //fitView();
}

// Release GPU/CPU resources held by the current preview lines.
function disposeLines() {
    if (_lines) {
        for (var i = 0; i < _lines.length; ++i) {
            if (_lines[i].geometry)
                _lines[i].geometry.dispose();
        }
    }
}

// --- Grid patterns ---------------------------------------------------------
//
// The geometry (preview lines + export faces) is produced by the grid pattern
// the user picks from the dropdown. Each pattern is a module in
// js/gridpatterns/ registered with the global GridPatterns registry; see
// docs/GRID_PATTERNS.md for the generator contract.

// The currently selected pattern (falls back to the default if the stored id
// is unknown, e.g. after a pattern is removed).
function activePattern() {
    return GridPatterns.get(_guiOptions.gridPattern) ||
           GridPatterns.get(GridPatterns.defaultId());
}

// Lazily-initialized { paramId: value } store for a pattern, seeded from the
// pattern's declared parameter defaults.
function patternParamValues(pattern) {
    var store = _guiOptions.patternParams[pattern.id];
    if (!store) {
        store = {};
        (pattern.params || []).forEach(function(p) { store[p.id] = p.value; });
        _guiOptions.patternParams[pattern.id] = store;
    }
    return store;
}

// Sample the image at a pixel (clamped to the image bounds) and return the
// mesh height (mm) plus the line/vertex color (0..1).
function samplePixel(px, py) {
    if (px < 0) px = 0; else if (px > _imageWidth - 1) px = _imageWidth - 1;
    if (py < 0) py = 0; else if (py > _imageHeight - 1) py = _imageHeight - 1;
    var c = getColor(px, py);
    return { z: getBrightness(c) * _guiOptions.maxHeight, r: c.r, g: c.g, b: c.b };
}

// The context handed to a pattern's build() call.
function buildPatternContext() {
    return {
        imageWidth: _imageWidth,
        imageHeight: _imageHeight,
        pixelStep: _guiOptions.pixelStep,
        meshStep: _guiOptions.meshStep,
        maxHeight: _guiOptions.maxHeight,
        params: patternParamValues(activePattern()),
        sample: samplePixel
    };
}

// A string that changes only when the geometry's topology/vertex count does
// (pattern, image dimensions, pixelStep, and the pattern's own parameters).
// meshStep / maxHeight / invert / smoothing / absolute do NOT appear here, so
// changing them takes the in-place fast path (3.3).
function structuralSignature() {
    var pattern = activePattern();
    return pattern.id + '|' + _imageWidth + 'x' + _imageHeight +
           '|ps' + _guiOptions.pixelStep +
           '|' + JSON.stringify(patternParamValues(pattern));
}

function ensureMaterial() {
    if (_material == null) {
        _material = new THREE.LineBasicMaterial({
            color: 0xffffff,
            opacity: 1.0,
            linewidth: 3.0, //_guiOptions.lineThickness,
            depthTest: false,
            vertexColors: true  // r137: boolean (THREE.VertexColors enum removed)
        } );
    }
}

/**
 * Create the preview lines from the image using the active grid pattern.
 *
 * Uses THREE.BufferGeometry (3.1) - typed arrays uploaded to the GPU once.
 * When only height/color parameters change (same structural signature) the
 * existing line buffers are mutated in place (3.3); a change of pattern,
 * pixelStep, image, or a pattern parameter triggers a full rebuild.
 */
function createLines() {

    if (_inputImage == null)
        return;

    var sig = structuralSignature();

    // Fast path: structure unchanged, just refresh positions + colors (3.3).
    if (_lineGroup && _lines && _lines.length > 0 && _structSig === sig) {
        var resFast = activePattern().build(buildPatternContext());
        refreshLineBuffers(resFast);
        computeGeomBounds(resFast);
        updateSurfaceDims();
        render();
        return;
    }

    // Full rebuild (topology changed).
    if (_lineGroup) {
        _lineHolder.remove(_lineGroup);
        disposeLines();
    }

    _lineGroup = new THREE.Object3D();
    _lines = [];
    _structSig = sig;

    ensureMaterial();

    var res = activePattern().build(buildPatternContext());

    // One THREE.Line per polyline; each gets its own buffers gathered from the
    // shared vertex pool. The polyline's index list is kept so the fast path
    // can re-gather into these same buffers without reallocating.
    res.polylines.forEach(function(indices) {
        var buffers = gatherLineBuffers(res, indices);
        var geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.BufferAttribute(buffers.pos, 3));
        geom.setAttribute('color', new THREE.BufferAttribute(buffers.col, 3));
        _lineGroup.add(new THREE.Line(geom, _material));
        _lines.push({ geometry: geom, indices: indices });
    });

    _lineHolder.add(_lineGroup);

    computeGeomBounds(res);
    updateSurfaceDims();
    render();
}

// Gather a polyline's per-vertex positions + colors out of the build result's
// shared vertex pool into fresh contiguous typed arrays.
function gatherLineBuffers(res, indices) {
    var n = indices.length;
    var pos = new Float32Array(n * 3);
    var col = new Float32Array(n * 3);
    for (var k = 0; k < n; ++k) {
        var b = indices[k] * 3;
        var o = k * 3;
        pos[o]     = res.positions[b];
        pos[o + 1] = res.positions[b + 1];
        pos[o + 2] = res.positions[b + 2];
        col[o]     = res.colors[b];
        col[o + 1] = res.colors[b + 1];
        col[o + 2] = res.colors[b + 2];
    }
    return { pos: pos, col: col };
}

// Refresh every preview line's positions + colors in place from a new build
// result with the same topology (fast path), then flag for GPU re-upload.
function refreshLineBuffers(res) {
    for (var n = 0; n < _lines.length; ++n) {
        var rec = _lines[n];
        var indices = rec.indices;
        var pos = rec.geometry.attributes.position.array;
        var col = rec.geometry.attributes.color.array;
        for (var k = 0; k < indices.length; ++k) {
            var b = indices[k] * 3;
            var o = k * 3;
            pos[o]     = res.positions[b];
            pos[o + 1] = res.positions[b + 1];
            pos[o + 2] = res.positions[b + 2];
            col[o]     = res.colors[b];
            col[o + 1] = res.colors[b + 1];
            col[o + 2] = res.colors[b + 2];
        }
        rec.geometry.attributes.position.needsUpdate = true;
        rec.geometry.attributes.color.needsUpdate = true;
        rec.geometry.computeBoundingSphere();
    }
}

// Compute the XYZ bounding box of a build result and cache it in _geomBounds
// (used for the dimension readout and for framing the camera). Works for any
// pattern, not just a rectangular grid.
function computeGeomBounds(res) {
    var p = res.positions;
    if (!p || p.length < 3) {
        _geomBounds = null;
        return;
    }

    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (var i = 0; i < p.length; i += 3) {
        var x = p[i], y = p[i + 1], z = p[i + 2];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
    }

    _geomBounds = { minX: minX, maxX: maxX, minY: minY, maxY: maxY, minZ: minZ, maxZ: maxZ };
}

// Update the on-screen surface dimension readout from the cached bounds.
function updateSurfaceDims() {
    var el = document.getElementById('surfacedim');
    if (!_geomBounds) {
        el.textContent = '—';
        return;
    }

    var surfaceWidth  = parseFloat(Math.round((_geomBounds.maxX - _geomBounds.minX) * 100) / 100).toFixed(2);
    var surfaceHeight = parseFloat(Math.round((_geomBounds.maxY - _geomBounds.minY) * 100) / 100).toFixed(2);
    el.textContent = surfaceWidth + ' x ' + surfaceHeight + ' ' + currentUnitDef().label;
}

// --- View controls ---------------------------------------------------------

// Drop the active controls instance. Null _controls first so animate() cannot
// call update() on a disposed object while a new instance is being created.
function disposeViewControls() {
    var oldControls = _controls;
    _controls = null;
    if (oldControls) {
        oldControls.dispose();
        oldControls = null;
    }
}

function trackballHandleResize(controls) {
    if (typeof controls.handleResize !== 'function')
        return;
    var box = _renderer.domElement.getBoundingClientRect();
    if (box.width > 0 && box.height > 0)
        controls.handleResize();
}

function createTrackballControls() {
    _controls = new TrackballControls(_camera, _renderer.domElement);

    _controls.rotateSpeed = 1.0;
    _controls.zoomSpeed = 1.2;
    _controls.panSpeed = 0.8;
    _controls.staticMoving = true;
    _controls.keys = [ 'KeyA', 'KeyS', 'KeyD' ];

    trackballHandleResize(_controls);
}

function createOrbitControls() {
    _controls = new OrbitControls(_camera, _renderer.domElement);
    //_controls.listenToKeyEvents(window);

    _controls.enableZoom = true;
    _controls.enablePan = true;
    _controls.enableRotate = true;
    _controls.screenSpacePanning = false;
    _controls.maxPolarAngle = Math.PI / 2;
}

// Create (or recreate) view controls on the renderer canvas. Called at startup
// and after clearImageLoaded().
function initViewControls() {
    disposeViewControls();

    if (USE_TRACKBALL_CONTROLS)
        createTrackballControls();
    else
        createOrbitControls();
}

// Frame the camera so the whole current geometry fits in the view. Because the
// surface is authored in the document's units, its size varies a lot (a few
// units in inches vs. tens in mm), so a fixed camera distance won't do - we fit
// to the geometry's bounding sphere. Geometry is centred on the origin, so the
// orbit target stays at (0,0,0); only camera distance changes.
// TODO: This is not working as expected.  When this is used to fit the view,
// TODO: the camera controls fail to work.  Have tried many different variations of
// TODO: updating the camera controls, but none of them work.
function fitView() {
    if (!_geomBounds || !_renderer || !_camera)
        return;

    var aspect = window.innerWidth / window.innerHeight || 1;
    _renderer.setSize(window.innerWidth, window.innerHeight, false);

    var b = _geomBounds;
    var dx = b.maxX - b.minX, dy = b.maxY - b.minY, dz = b.maxZ - b.minZ;
    var radius = 0.5 * Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;

    // Distance that fits the geometry both vertically and horizontally (the
    // horizontal FOV is derived from the vertical FOV and the viewport aspect).
    var cameraFov = (_camera && _camera.fov) ? _camera.fov : 60;
    var vFov = cameraFov * Math.PI / 180;
    var hFov = 2 * Math.atan(Math.tan(vFov / 2) * Math.max(aspect, 1e-3));
    var distV = (Math.max(dy, dz) / 2) / Math.tan(vFov / 2);
    var distH = (Math.max(dx, dz) / 2) / Math.tan(hFov / 2);
    var dist = Math.max(distV, distH, radius) * 1.3;   // 1.3 = margin

    var origin = new THREE.Vector3(0, 0, 0);
    var direction = _camera
        ? new THREE.Vector3().subVectors(_camera.position, origin)
        : new THREE.Vector3(0, 0, 1);
    if (direction.lengthSq() < 1e-12)
        direction.set(0, 0, 1);
    else
        direction.normalize();

    var near = Math.max(dist / 1000, 0.1);
    var far = (dist + radius) * 6;
    var position = direction.clone().multiplyScalar(dist);

    disposeViewControls();

    // Set the camera properties
    _camera.aspect = aspect;
    _camera.position.copy(position);
    _camera.near = near;
    _camera.far = far;
    _camera.updateProjectionMatrix();

    if (USE_TRACKBALL_CONTROLS) {
        createTrackballControls();
    }
    else {
        createOrbitControls();
    }

    render();
}


// --- Grid-pattern UI -------------------------------------------------------

// Populate the pattern dropdown and wire it up.
function initGridPatternUI() {
    var sel = document.getElementById('ctrl-gridPattern');
    if (!sel) return;

    GridPatterns.list().forEach(function(p) {
        var opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        sel.appendChild(opt);
    });

    sel.value = _guiOptions.gridPattern;
    // Guard against a stored id that no longer exists.
    if (!sel.value && GridPatterns.defaultId()) {
        _guiOptions.gridPattern = GridPatterns.defaultId();
        sel.value = _guiOptions.gridPattern;
    }

    sel.addEventListener('change', function() {
        _guiOptions.gridPattern = sel.value;
        renderPatternParams();
        updatePixelStepVisibility();
        createLines();
    });

    renderPatternParams();
    updatePixelStepVisibility();
}

// Show the global "Pixels to Skip" control only for patterns that actually use
// it (the rectangular grid). Other patterns drive spacing from their own
// per-pattern parameters, so the control would be misleading.
function updatePixelStepVisibility() {
    var row = document.getElementById('row-pixelStep');
    if (!row) return;
    row.style.display = activePattern().usesPixelStep ? '' : 'none';
}

// Refresh the small value badge next to a pattern-parameter range control.
function updatePatternParamLabel(p, value) {
    var label = document.getElementById('val-pp-' + p.id);
    if (label)
        label.textContent = Number(value).toFixed(p.decimals || 0);
}

// Rebuild the dynamic per-pattern parameter controls for the active pattern.
function renderPatternParams() {
    var container = document.getElementById('pattern-params');
    if (!container) return;

    container.innerHTML = '';

    var pattern = activePattern();
    var params = pattern.params || [];
    var store = patternParamValues(pattern);

    params.forEach(function(p) {
        var value = store[p.id];

        if (p.type === 'toggle') {
            var lbl = document.createElement('label');
            lbl.className = 'flex items-center justify-between cursor-pointer';
            lbl.innerHTML =
                '<span class="text-xs">' + p.label + '</span>' +
                '<input type="checkbox" id="ctrl-pp-' + p.id + '" class="toggle toggle-primary toggle-sm">';
            container.appendChild(lbl);

            var toggle = document.getElementById('ctrl-pp-' + p.id);
            toggle.checked = !!value;
            toggle.addEventListener('change', function() {
                store[p.id] = toggle.checked;
                createLines();
            });
        }
        else { // range
            var fc = document.createElement('div');
            fc.className = 'form-control';
            fc.innerHTML =
                '<div class="flex items-center justify-between mb-1">' +
                    '<span class="text-xs">' + p.label + '</span>' +
                    '<span id="val-pp-' + p.id + '" class="badge badge-sm badge-ghost font-mono"></span>' +
                '</div>' +
                '<input type="range" id="ctrl-pp-' + p.id + '" min="' + p.min + '" max="' + p.max +
                    '" step="' + p.step + '" class="range range-primary range-xs w-full">';
            container.appendChild(fc);

            var range = document.getElementById('ctrl-pp-' + p.id);
            range.value = value;
            updatePatternParamLabel(p, value);
            range.addEventListener('input', function() {
                var v = parseFloat(range.value);
                store[p.id] = v;
                updatePatternParamLabel(p, v);
                createLines();
            });
        }
    });
}

// Called from html page
function createMeshOBJString() {

    if (_inputImage == null)
        return "";

    render();

    // Build the same geometry the preview uses for the active pattern, then
    // turn its vertices + faces into a mesh (with normals) for OBJ export.
    var res = activePattern().build(buildPatternContext());
    if (!res.faces || res.faces.length === 0)
        return "";

    var mesh = Utils.buildMesh(res.positions, res.faces);

    // Now generate a string containing the OBJ file contents
    return Utils.createOBJString(_imageFileName || "", mesh);
}

function animate() {
    requestAnimationFrame(animate);
    if (_controls)
        _controls.update();
    if (_renderer && _scene && _camera)
        render();
}

function onWindowResize() {
    if (!_camera || !_renderer)
        return;

    _camera.aspect = window.innerWidth / window.innerHeight;
    _camera.updateProjectionMatrix();
    _renderer.setSize(window.innerWidth, window.innerHeight, false);

    if (_controls && USE_TRACKBALL_CONTROLS)
        trackballHandleResize(_controls);

    if (_scene)
        render();
}

function render() {
    _renderer.render(_scene, _camera);
}

// Returns a Color for a given pixel in the pixel array.
// Index is X (left to right), Y (top to bottom)
function getColor(x, y) {
    x = Math.floor(x);
    y = Math.floor(y);

    var base = (y * _imageWidth + x) * 4;
    var r = _pixels[base + 0];
    var g = _pixels[base + 1];
    var b = _pixels[base + 2];
    // var a = _pixels[base + 3];	// REVIEW: Use alpha in calc?

    if (_guiOptions.smoothing) {
        // Average over the 3x3 neighbourhood, but only count the samples
        // that actually exist. Near image edges fewer than 9 neighbours are
        // available, so divide by the real sample count instead of always
        // dividing by 9 (which under-weighted border pixels).
        var sumR = 0, sumG = 0, sumB = 0, count = 0;
        for (var dy = -1; dy <= 1; ++dy) {
            var ny = y + dy;
            if (ny < 0 || ny >= _imageHeight) continue;
            for (var dx = -1; dx <= 1; ++dx) {
                var nx = x + dx;
                if (nx < 0 || nx >= _imageWidth) continue;
                var ni = (ny * _imageWidth + nx) * 4;
                sumR += _pixels[ni + 0];
                sumG += _pixels[ni + 1];
                sumB += _pixels[ni + 2];
                ++count;
            }
        }
        r = sumR / count;
        g = sumG / count;
        b = sumB / count;
    }

    // Init with rgb (0-1)
    return new THREE.Color(r / 255, g / 255, b / 255);
}


//return pixel brightness between 0 and 1 based on human perceptual bias
function getBrightness(c) {
    var brightness = 0.0;
    if (_guiOptions.absolute) {
    	brightness = (c.r + c.g + c.b) / 3.0;
    } else {
        // ITU-R BT.709 (sRGB) luma coefficients - the standard perceptual
        // brightness weights, replacing the former non-standard 0.34/0.50/0.16.
    	brightness = ( 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b );
    }
    if (_guiOptions.invert)
        brightness = 1.0 - brightness;
    return brightness;
}

function setLoadPromptVisible(flag) {
    var el = document.getElementById('loadprompt');
    if (!el) return;
    // "flex" (not "block") so the overlay centers its prompt content.
    if (flag && typeof(FileReader) != "undefined")
        el.style.display = "flex";
    else
        el.style.display = "none";
}

// --- Fusion palette bridge (HTML onclick + Python sendInfoToHTML) ----------

function sendToHost(action, payload) {
    var data = { action: action };
    if (payload) {
        for (var k in payload) {
            if (Object.prototype.hasOwnProperty.call(payload, k))
                data[k] = payload[k];
        }
    }
    var json = JSON.stringify(data);

    try {
        if (typeof adsk !== 'undefined' && adsk && typeof adsk.fusionSendData === 'function')
            return adsk.fusionSendData(action, json);
    } catch (e) { console.log('fusionSendData failed: ' + e); }

    try {
        if (typeof neutronJavaScriptObject !== 'undefined' && neutronJavaScriptObject)
            return neutronJavaScriptObject.executeQuery(action, json);
    } catch (e) { console.log('executeQuery failed: ' + e); }

    if (window.parent && window.parent !== window)
        window.parent.postMessage({ action: action, data: json }, '*');
    else
        window.postMessage({ action: action, data: json }, '*');
    return null;
}

function applyUnitsFromMessage(msg) {
    if (!msg || typeof msg !== 'string') return;
    try {
        var p = JSON.parse(msg);
        if (p && p.unit)
            setDocumentUnit(p.unit);
    } catch (e) { /* not a units payload - ignore */ }
}

function sendInfoToFusion() {
    sendToHost('send', { obj: createMeshOBJString() });
}

function clearImage() {
    clearImageLoaded();
}

var _bridgeRetries = 40;

function requestUnitsFromHost() {
    var haveBridge =
        (typeof adsk !== 'undefined' && adsk && typeof adsk.fusionSendData === 'function') ||
        (typeof neutronJavaScriptObject !== 'undefined' && neutronJavaScriptObject);
    if (!haveBridge && _bridgeRetries-- > 0) {
        setTimeout(requestUnitsFromHost, 250);
        return;
    }
    applyUnitsFromMessage(sendToHost('ready', {}));
}

window.sendInfoToFusion = sendInfoToFusion;
window.clearImage = clearImage;
window.clearImageLoaded = clearImageLoaded;
window.createMeshOBJString = createMeshOBJString;
window.setDocumentUnit = setDocumentUnit;

window.fusionJavaScriptHandler = {
    handle: function (action, data) {
        try {
            if (action === 'units')
                applyUnitsFromMessage(data);
            return 'OK';
        } catch (e) {
            console.log('fusionJavaScriptHandler error: ' + e);
            return 'FAILED';
        }
    }
};

window.addEventListener('load', function () {
    setTimeout(requestUnitsFromHost, 300);
});
