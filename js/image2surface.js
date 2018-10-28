//Author-Hans Kellner
//Description-Generate a surface from an image in Autodesk Fusion 360.

/*!
Copyright (C) 2015-2018 Hans Kellner: https://github.com/hanskellner/Fusion360Image2Surface
MIT License: See https://github.com/hanskellner/Fusion360Image2Surface/LICENSE.md
*/

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
    _gui,
    _guiOptions;


var GuiOptions = function() {
    this.pixelStep = 5;	// pixel step over in the image
    this.meshStep = 1;	// amount in mms to step over mesh per pixel
    this.maxHeight = 5; // max mesh height in mms for brightest image color
    this.invert = false; // true to invert height values (dark == highest)
    this.smoothing = true; //turn on smoothing
};

// Initialize the page
$(document).ready( function() {

    _gui = new dat.GUI();
    
    _guiOptions = new GuiOptions();
    _gui.add(_guiOptions, 'pixelStep', 1.00, 50.00, 5.00).name('Pixels to Skip').step(0.01).onChange( createLines );
    _gui.add(_guiOptions, 'meshStep', 0.10, 25.00, 1.00).name('Stepover (mm)').step(0.01).onChange( createLines );
    _gui.add(_guiOptions, 'maxHeight', 1.00, 25.00, 5.00).name('Max Height (mm)').step(0.01).onChange( createLines );
    _gui.add(_guiOptions, 'invert').name('Invert Heights').onChange( createLines );
    _gui.add(_guiOptions, 'smoothing').name('Smooth').onChange( createLines );
    
    $(window).bind('resize', onWindowResize);

    //init image drag and drop
    if (typeof(FileReader) != "undefined") {

        var dropzoneId = "dropzone";

        window.addEventListener("dragenter", function(e) {
            var dropElement = $(e.target);
            if (!dropElement.hasClass(dropzoneId)) {
                e.dataTransfer.effectAllowed = "none";
                e.dataTransfer.dropEffect = "none";
            }
            event.preventDefault();
        }, false);

        window.addEventListener("dragover", function(e) {
            var dropElement = $(e.target);
            if (dropElement.hasClass(dropzoneId)) {
                $('.dropzone').css('background-color', 'green');
            }
            event.preventDefault();
        });
        
        window.addEventListener("dragleave", function(e) {
            var dropElement = $(e.target);
            if (dropElement.hasClass(dropzoneId)) {
                $('.dropzone').css('background-color', 'black');
            }
            event.preventDefault();
        });
        
        window.addEventListener("drop", function(e) {
            var dropElement = $(e.target);
            if (!dropElement.hasClass(dropzoneId)) {
                e.preventDefault();
                e.dataTransfer.effectAllowed = "none";
                e.dataTransfer.dropEffect = "none";
            }
            else {
                $('.dropzone').css('background-color', 'black');
                e.preventDefault();
                
                var file = event.dataTransfer.files[0];
                loadImageFile(file);
            }
        });

        enableDropZone(true);

        document.getElementById('getimagefile').addEventListener('change', readImageURL, true);
    }

// stop the user getting a text cursor
    document.onselectstart = function() {
        return false;
    };
    
    _content = document.getElementById("content");

    $(window).keydown(onKeyDown);

    if (!Detector.webgl) {
        $('#dropzone').empty();
        Detector.addGetWebGLMessage({
            parent: document.getElementById('dropzone')
        });
    }
    else {
        _camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 5000);
        _camera.position.z = 400;
    
        _renderer = new THREE.WebGLRenderer({
            antialias: true,
            clearAlpha: 1,
            sortObjects: false,
            sortElements: false
        });
        //_renderer.setPixelRatio( window.devicePixelRatio ? window.devicePixelRatio : 1 );
    
        _content.appendChild(_renderer.domElement);
    
        // Create and attach controls to the renderer.
        // Controls only work when the mouse is over the renderer's domElement (the canvas). 
        _controls = new THREE.TrackballControls( _camera, _renderer.domElement );
        _controls.rotateSpeed = 2.0;
        _controls.zoomSpeed = 1.2;
        _controls.panSpeed = 0.8;
        _controls.noZoom = false;
        _controls.noPan = false;
        _controls.staticMoving = true; // true == Disable damping
        //_controls.dynamicDampingFactor = 0.3;
        //_controls.keys = [ 65, 83, 68 ];

        _controls.addEventListener( 'change', render );

        _scene = new THREE.Scene();
    
        _lineHolder = new THREE.Object3D();
        _scene.add(_lineHolder);
    }

    onWindowResize();
    animate();
});

function resetGUIOptions() {
    _guiOptions.pixelStep = 5;
    _guiOptions.meshStep = 1;
    _guiOptions.maxHeight = 5;
    _guiOptions.invert = false;
    _guiOptions.smoothing = true; //turn on smoothing

    // Iterate over all controllers
    for (var i in _gui.__controllers) {
        _gui.__controllers[i].updateDisplay();
    }
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
    $('#imagefilename').html(_imageFileName);
}

// Called from html page
function clearImageLoaded() {
    _inputImage = null;

    $('#imagefilename').html('');
    $('#imagedim').html('');

    if (_lineGroup != null) {
        _lineHolder.remove(_lineGroup);
        _lineGroup = null;
    }

    enableDropZone(true);

    // Reset camera/controls
    _camera.position.z = 400;
    _controls.reset();
}

function onImageLoaded() {

    resetGUIOptions();

    // load image into canvas pixels
    _imageWidth = _inputImage.width;
    _imageHeight = _inputImage.height;

    $('#imagedim').html(_imageWidth + ' x ' + _imageHeight);

    _canvas	= document.createElement('canvas');
    _canvas.width = _imageWidth
    _canvas.height = _imageHeight;

    _context = _canvas.getContext('2d');
    _context.drawImage(_inputImage, 0, 0);

    _pixels	= _context.getImageData(0,0,_imageWidth,_imageHeight).data;

    enableDropZone(false); // Hide while editing

    createLines();
}

/**
 * Create Lines from image
 */
function createLines() {

    if (_inputImage == null)
        return;

    if (_lineGroup)
        _lineHolder.remove(_lineGroup);

    _lineGroup = new THREE.Object3D();

    _material = new THREE.LineBasicMaterial({
        color: 0xffffff,
        opacity: 1.0,
        linewidth: 3.0, //_guiOptions.lineThickness,
        //blending: THREE.AdditiveBlending,
        depthTest: false,
        vertexColors: true
    } );

    var xSteps = Math.floor(_imageWidth / _guiOptions.pixelStep);
    var ySteps = Math.floor(_imageHeight / _guiOptions.pixelStep);

    var xStepsHalf = Math.floor(xSteps/2);
    var yStepsHalf = Math.floor(ySteps/2);

    // go through the image pixels.  Note that Y == 0 is the top of the image.
    // First create lines along X axis
    for (var y1 = 0; y1 < ySteps; ++y1) {
        
        var geometry = new THREE.Geometry();
        var yStepMesh = (yStepsHalf - y1 - 1) * _guiOptions.meshStep;

        for (var x1 = 0; x1 < xSteps; ++x1) {
            
            var color = getColor(x1 * _guiOptions.pixelStep, y1 * _guiOptions.pixelStep);
            var brightness = getBrightness(color); // 0 - 1
            
            var zHeight = brightness * _guiOptions.maxHeight;

            var xStepMesh = (x1 - xStepsHalf) * _guiOptions.meshStep;

            geometry.vertices.push(new THREE.Vector3(xStepMesh, yStepMesh, zHeight));
            geometry.colors.push(color);
        }

        //add a line along X axis
        _lineGroup.add(new THREE.Line(geometry, _material));
    }

    // Now create lines along Y axis
    for (var x2 = 0; x2 < xSteps; ++x2) {
        
        var geometry = new THREE.Geometry();
        var xStepMesh = (x2 - xStepsHalf) * _guiOptions.meshStep;

        for (var y2 = 0; y2 < ySteps; ++y2) {

            var color = getColor(x2 * _guiOptions.pixelStep, y2 * _guiOptions.pixelStep);
            var brightness = getBrightness(color); // 0 - 1
            
            var zHeight = brightness * _guiOptions.maxHeight;

            var yStepMesh = (yStepsHalf - y2 - 1) * _guiOptions.meshStep;

            geometry.vertices.push(new THREE.Vector3(xStepMesh, yStepMesh, zHeight));
            geometry.colors.push(color);
        }

        //add a line along Y axis
        _lineGroup.add(new THREE.Line(geometry, _material));
    }

    _lineHolder.add(_lineGroup);

    // Calc surface/mesh dimensions but round to 2 decimal places
    var surfaceWidth  = parseFloat(Math.round((xSteps * _guiOptions.meshStep) * 100) / 100).toFixed(2);
    var surfaceHeight = parseFloat(Math.round((ySteps * _guiOptions.meshStep) * 100) / 100).toFixed(2);
    $('#surfacedim').html(surfaceWidth + ' x ' + surfaceHeight + ' mms');
}

// Returns an array containing height data normalized to the specified height value.
function getHeightData() {

    var xSteps = Math.floor(_imageWidth / _guiOptions.pixelStep);
    var ySteps = Math.floor(_imageHeight / _guiOptions.pixelStep);

    var heightData = new Float32Array( xSteps * ySteps );

    var idxHeight = 0;

    // Note that we need to step from bottom to top since image data is
    // top->bottom but model data is bottom->top
    for (var y = ySteps - 1; y >= 0; --y) {
        var yStep = y * _guiOptions.pixelStep;

        for (var x = 0; x < xSteps; ++x) {
            var xStep = x * _guiOptions.pixelStep;

            var color = getColor(xStep, yStep);
            var brightness = getBrightness(color); // val 0 - 1

            heightData[idxHeight++] = brightness * _guiOptions.maxHeight;
        }
    }

    return { data: heightData, width: xSteps, height: ySteps };
}

// Called from html page
function createMeshOBJString() {
    
    render();

    // Get the height data from the image
    var imageHeightData = getHeightData();
    if (imageHeightData < 1)
        return "";

    // Generate the mesh for the height data.  Use quads as Fusion hates tris.
    var mesh = Utils.createMesh(imageHeightData.data, imageHeightData.width, imageHeightData.height, _guiOptions.meshStep, true /*isQuad*/);

    // Now generate a string containing the OBJ file contents
    return Utils.createOBJString("", mesh);
}

function onKeyDown(evt) {
    //'S' key
    //if (event.keyCode == '83') {
    //	onWindowResize();
    //}
}

function animate() {
    requestAnimationFrame(animate);
    _controls.update();
    render();
}

function onWindowResize() {
    _camera.aspect = window.innerWidth / window.innerHeight;
    _camera.updateProjectionMatrix();
    _renderer.setSize( window.innerWidth, window.innerHeight, false );
    _controls.handleResize();
    render();
}

function render() {
    _renderer.render(_scene, _camera);
}

// Returns a Color for a given pixel in the pixel array.
// Index is X (left to right), Y (top to bottom)
function getColor(x, y) {
    var base = (Math.floor(y) * _imageWidth + Math.floor(x)) * 4;
    var c = {
        r: _pixels[base + 0],
        g: _pixels[base + 1],
        b: _pixels[base + 2],
        a: _pixels[base + 3]	// REVIEW: Use alpha in calc?
    };
    if (_guiOptions.smoothing&&x>0&&y>0&&x<_imageWidth-1&&y<_imageHeight-1) {
    	//console.log( 'X:', x );

    	var left = ((Math.floor(y) * _imageWidth + Math.floor(x-1)) * 4);
    	var leftup = ((Math.floor(y-1) * _imageWidth + Math.floor(x-1)) * 4);
    	var leftdown = ((Math.floor(y+1) * _imageWidth + Math.floor(x-1)) * 4);
    	var right = ((Math.floor(y) * _imageWidth + Math.floor(x+1)) * 4);
    	var rightup = ((Math.floor(y-1) * _imageWidth + Math.floor(x+1)) * 4);
    	var rightdown = ((Math.floor(y+1) * _imageWidth + Math.floor(x+1)) * 4);
    	var up = ((Math.floor(y-1) * _imageWidth + Math.floor(x)) * 4);
    	var down = ((Math.floor(y+1) * _imageWidth + Math.floor(x)) * 4);

    	c.r+=_pixels[left+0]+_pixels[right+0]+_pixels[up+0]+_pixels[down+0]+_pixels[leftup+0]+_pixels[leftdown+0]+_pixels[rightup+0]+_pixels[rightdown+0];
    	c.g+=_pixels[left+1]+_pixels[right+1]+_pixels[up+1]+_pixels[down+1]+_pixels[leftup+1]+_pixels[leftdown+1]+_pixels[rightup+1]+_pixels[rightdown+1];
    	c.b+=_pixels[left+2]+_pixels[right+2]+_pixels[up+2]+_pixels[down+2]+_pixels[leftup+2]+_pixels[leftdown+2]+_pixels[rightup+2]+_pixels[rightdown+2];

	c.r/=9;
	c.g/=9;
	c.b/=9;
    }

    // Init with rgb (0-1)
    return new THREE.Color(c.r/255, c.g/255, c.b/255);
}

//return pixel brightness between 0 and 1 based on human perceptual bias
function getBrightness(c) {
    var brightness = ( 0.34 * c.r + 0.5 * c.g + 0.16 * c.b );
    if (_guiOptions.invert)
        brightness = 1.0 - brightness;
    return brightness;
}

function enableDropZone(flag) {
    var dz = $('#dropzone');
    if (flag && typeof(FileReader) != "undefined")
        dz.css({ display: "block" });
    else
        dz.css({ display: "none" });
}
