//Author-Hans Kellner
//Description-Generate a surface from an image in Autodesk Fusion 360.

/*!
Copyright (C) 2015 Hans Kellner: https://github.com/hanskellner/Fusion360Image2Surface
MIT License: See https://github.com/hanskellner/Fusion360Image2Surface/LICENSE.md
*/

/*
This is a script for Autodesk Fusion 360 that generates a surface from an image.

Installation:

Copy this scripts folder into your Fusion 360 "My Scripts" folder. You may find this folder using the following steps:

1) Start Fusion 360 and then select the File -> Scripts... menu item
2) The Scripts Manager dialog will appear and display the "My Scripts" folder and "Sample Scripts" folders
3) Select one of the "My Scripts" files and then click on the "+" Details icon near the bottom of the dialog.
  a) If there are no files in the "My Scripts" folder then create a default one.
  b) Click the Create button, select JavaScript, and then OK.
5) With the user script selected, click the Full Path "..." button to display a file explorer window that will display the "My Scripts" folder
6) Copy the files into the folder

For example, on a Mac the folder is located in:
/Users/USERNAME/Library/Application Support/Autodesk/Autodesk Fusion 360/API/Scripts

*/

/*globals adsk*/
function run(context) {

    "use strict";

    if (adsk.debug === true) {
        /*jslint debug: true*/
        debugger;
        /*jslint debug: false*/
    }

    var SURFACE_STYLE = {
        MESH_BODY: 0,
        SKETCH_POINTS: 1,
        SKETCH_LINES: 2,
        LAST_STYLE: 2
    };

    var EXPORT_FORMAT = {
        OBJ: 0,
        STL: 1
    };

	var appTitle = 'Image 2 Surface';

	var app = adsk.core.Application.get(), ui;
    if (app) {
        ui = app.userInterface;
        if (!ui) {
            adsk.terminate();
    		return;
        }
    }

	var design = adsk.fusion.Design(app.activeProduct);
	if (!design) {
		ui.messageBox('No active design', appTitle);
		adsk.terminate();
		return;
	}

    // Create the command definition.
    var createCommandDefinition = function() {
        var commandDefinitions = ui.commandDefinitions;

        // Be fault tolerant in case the command is already added...
        var cmDef = commandDefinitions.itemById('Image2Surface');
        if (!cmDef) {
            cmDef = commandDefinitions.addButtonDefinition('Image2Surface',
                    'Image 2 Surface',
                    'Generates a surface from an image.',
                    './resources'); // relative resource file path is specified
        }
        return cmDef;
    };

    // CommandCreated event handler.
    var onCommandCreated = function(args) {
        try {
            // Connect to the CommandExecuted event.
            var command = args.command;
            command.execute.add(onCommandExecuted);

            // Terminate the script when the command is destroyed
            command.destroy.add(function () { adsk.terminate(); });

            // Define the inputs.
            var inputs = command.commandInputs;

            var styleInput = inputs.addDropDownCommandInput('style', 'Style', adsk.core.DropDownStyles.TextListDropDownStyle );
            styleInput.listItems.add('Mesh Body',true);
            styleInput.listItems.add('Sketch Points',false);
            styleInput.listItems.add('Sketch Lines',false);

            var initialValLenPerPixel = adsk.core.ValueInput.createByReal(0.1);
            inputs.addValueInput('lenPerPixel', 'Length per pixel', 'mm' , initialValLenPerPixel);

            var initialValH = adsk.core.ValueInput.createByReal(1.0);
            inputs.addValueInput('maxHeight', 'Max surface height', 'mm' , initialValH);

            var exportFormatInput = inputs.addDropDownCommandInput('exportFormat', 'Export format', adsk.core.DropDownStyles.TextListDropDownStyle );
            exportFormatInput.listItems.add('OBJ',true);
            exportFormatInput.listItems.add('STL',false);
        }
        catch (e) {
            ui.messageBox('Failed to create command : ' + (e.description ? e.description : e));
        }
    };

    // CommandExecuted event handler.
    var onCommandExecuted = function(args) {
        try {

            // Extract input values
            var unitsMgr = app.activeProduct.unitsManager;
            var command = adsk.core.Command(args.firingEvent.sender);
            var inputs = command.commandInputs;

            var styleInput, lenPerPixelInput, maxHeightInput, exportFormatInput;

            // REVIEW: Problem with a problem - the inputs are empty at this point. We
            // need access to the inputs within a command during the execute.
            for (var n = 0; n < inputs.count; n++) {
                var input = inputs.item(n);
                if (input.id === 'style') {
                    styleInput = adsk.core.DropDownCommandInput(input);
                }
                else if (input.id === 'lenPerPixel') {
                    lenPerPixelInput = adsk.core.ValueCommandInput(input);
                }
                else if (input.id === 'maxHeight') {
                    maxHeightInput = adsk.core.ValueCommandInput(input);
                }
                else if (input.id === 'exportFormat') {
                    exportFormatInput = adsk.core.DropDownCommandInput(input);
                }
            }

            if (!styleInput || !lenPerPixelInput || !maxHeightInput || !exportFormatInput) {
                ui.messageBox("One of the inputs does not exist.");
                return;
            }

            // holds the parameters
            var params = {
                style: SURFACE_STYLE.MESH_BODY,
                exportFormat: EXPORT_FORMAT.OBJ,
                lenPerPixel: 1,         // mm
                maxSurfaceHeight: 10,   // mm
                scale: 1
            };

            params.style = styleInput.selectedItem.index;
            if (params.style < 0 || params.style > SURFACE_STYLE.LAST_STYLE) {
                ui.messageBox("Invalid style: must be 0 to "+SURFACE_STYLE.LAST_STYLE);
                return;
            }

            params.lenPerPixel = unitsMgr.evaluateExpression(lenPerPixelInput.expression, "mm");
            if (params.lenPerPixel <= 0.0) {
                ui.messageBox("Invalid length per pixel: must be > 0");
                return;
            }

            params.maxSurfaceHeight = unitsMgr.evaluateExpression(maxHeightInput.expression, "cm");
            if (params.maxSurfaceHeight <= 0.0) {
                ui.messageBox("Invalid height: must be > 0");
                return;
            }

            params.exportFormat = exportFormatInput.selectedItem.index;
            if (params.exportFormat < 0 || params.exportFormat > EXPORT_FORMAT.STL) {
                ui.messageBox("Invalid export format: must be 0 to "+EXPORT_FORMAT.STL);
                return;
            }

            if (isImageValid(theImage)) {
                image2surface(params, theImage);    // Generate the surface
            }
            else {
                ui.messageBox('Failed to load image : ' + imgFilename);
            }
        }
        catch (e) {
            ui.messageBox('Failed to execute command : ' + (e.description ? e.description : e));
        }
    };

    function isImageValid(img) {
        // During the onload event, IE correctly identifies any images that
        // weren’t downloaded as not complete. Others should too. Gecko-based
        // browsers act like NS4 in that they report this incorrectly.
        if (!img.complete) {
            return false;
        }

        // However, they do have two very useful properties: naturalWidth and
        // naturalHeight. These give the true size of the image. If it failed
        // to load, either of these should be zero.
        if (typeof img.naturalWidth !== "undefined" && img.naturalWidth === 0) {
            return false;
        }

        // No other way of checking: assume it’s ok.
        return true;
    }

    // Returns an array containing height data normalized to the specified height value.
    function getHeightData(img, maxSurfaceHeight) {

        if (!maxSurfaceHeight) {
            maxSurfaceHeight = 10;
        }

        var canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;

        var context = canvas.getContext( '2d' );
        context.drawImage(img,0,0);

        var heightDataSize = img.width * img.height;
        var heightData = new Float32Array( heightDataSize );

        var pixels = context.getImageData(0, 0, img.width, img.height).data;

        var minVal = Number.MAX_VALUE;
        var maxVal = Number.MIN_VALUE;

        var idxHeight = 0;

        // Note that we need to step from bottom to top since image data is
        // top->bottom but model data is bottom->top
        for (var y = img.height - 1; y >= 0; --y) {
             for (var x = 0; x < img.width; ++x) {

                  var idx = x * 4 + (y * 4) * img.width;
                  var val = (pixels[idx] + pixels[idx + 1] + pixels[idx + 2]) / 3;

                  if ( val < minVal ) {
                      minVal = val;
                  }
                  if ( val > maxVal ) {
                      maxVal = val;
                  }

                  heightData[idxHeight++] = val;
             }
        }

        var valRange = maxVal - minVal;
        if (valRange > 0) {

            // Normalize the values
            for (var i = 0; i < heightDataSize; ++i) {
                var h = heightData[i];
                heightData[i] = maxSurfaceHeight * ((h - minVal) / valRange);
            }
        }

        return heightData;
    }

    // http://stackoverflow.com/questions/857618/javascript-how-to-extract-filename-from-a-file-input-control
    function fileNameFromPath(fullPath, removeExt) {

        var startIndex = (fullPath.indexOf('\\') >= 0 ? fullPath.lastIndexOf('\\') : fullPath.lastIndexOf('/'));
    	var filename = fullPath.substring(startIndex);
    	if (filename.indexOf('\\') === 0 || filename.indexOf('/') === 0) {
    		filename = filename.substring(1);
    	}

        if (removeExt) {
            filename = filename.substring(0, filename.lastIndexOf('.'));
        }

        return filename;
    }

    function verifyOverwriteFile(filepath) {

        // Get the filename minus the path
        var filename = fileNameFromPath(filepath);

        try { // HACK: fileExists is throwing an exception if file doesn't exist
            if ( adsk.fileExists(filepath) ) {
                var res = ui.messageBox("Overwrite existing file '"+filename+"'?",
                            "Overwrite File?",
                            adsk.core.MessageBoxButtonTypes.OKCancelButtonType,
                            adsk.core.MessageBoxIconTypes.WarningIconType);
                if ( res != adsk.core.DialogResults.DialogOK ) {
                    return false;
                }
            }
        }
        catch (e) {}

        return true;    // allow since doesn't exist
    }

	function image2surface(params, img) {

        if (!img || img.width < 2 || img.height < 2) {
            console.log("Invalid image");
            return false;
        }

        // Get array of height data
        if (!imageHeightData) {
            imageHeightData = getHeightData(img, params.maxSurfaceHeight);
        }

        if (!imageHeightData || imageHeightData.length < 1) {
            console.log("Invalid image");
            return false;
        }

        // Create a sketch on the XY plane
        var root = design.rootComponent;
        var sketch = null;

        var retVal = true;

        if ( SURFACE_STYLE.MESH_BODY == params.style ) {

            var meshFileContents = "";  // This will contain a string to write to the file

            // Remove extension from image filename.
            var strOutFilename = imgFilename.replace(/\.[^/.]+$/, "");

            // Remove the "file://" prefix if it exists (when from img.src)
            if (strOutFilename.indexOf("file://") === 0) {
                strOutFilename = strOutFilename.substring(7);
            }

            // NOTE: Fusion currently likes quads and can't or has trouble
            // converting tri patches into t-splines.  STL doesn't support
            // tris so for now we use OBJ which does.
            if (params.exportFormat === EXPORT_FORMAT.STL) {

                strOutFilename += ".stl";  // Give it the correct extension
                if (!verifyOverwriteFile(strOutFilename)) {
                    return false;
                }

                // Generate a string containing the STL file contents
                // NOTE: Only supports tris and not quads
                meshFileContents = Utils.createSTLString(strOutFilename, imageHeightData, img.width, img.height, params.lenPerPixel);
            }
            else { // if (params.exportFormat === EXPORT_FORMAT.OBJ)

                strOutFilename += ".obj";  // Give it the correct extension
                if (!verifyOverwriteFile(strOutFilename)) {
                    return false;
                }

                // Generate the mesh for the height data.  Use quads as Fusion hates tris.
                var mesh = Utils.createMesh(imageHeightData, img.width, img.height, params.lenPerPixel, true /*isQuad*/);

                // Now generate a string containing the OBJ file contents
                meshFileContents = Utils.createOBJString(strOutFilename, mesh);
            }

            if (meshFileContents === '') {
                ui.messageBox('Failed to create mesh file: ' + strOutFilename);
                return false;
            }

            // Now let's write to the file.
            adsk.writeFile(strOutFilename, meshFileContents);

            // Finally, add a mesh body by importing this data (STL or OBJ file).
            var meshList = root.meshBodies.add( strOutFilename, adsk.fusion.MeshUnits.CentimeterMeshUnit );
            if (!meshList) {
                ui.messageBox('Failed to add mesh body from file: ' + imgFilename);
                return false;
            }
        }
        else { // SKETCH_POINTS and LINES

            try {

                sketch = root.sketches.add(root.xYConstructionPlane);
                sketch.name = "Image2Surface - " + sketch.name;

                var lines = sketch.sketchCurves.sketchLines;

                sketch.isComputeDeferred = true;    // defer while modifying to speed up

                // Steps in X and Y
                var step = params.lenPerPixel;

                for ( var row = 0; row < img.height; ++row ) {
                    for ( var col = 0; col < img.width; ++col ) {

                        var zHeight = imageHeightData[col + row*img.height];

                        if (params.style === SURFACE_STYLE.SKETCH_POINTS) {
                            // Add a sketchpoint for this height value
                            sketch.sketchPoints.add(adsk.core.Point3D.create(col*step, row*step, zHeight));
                        }
                        else if (params.style === SURFACE_STYLE.SKETCH_LINES) {
                            // Or lines
                            var pt1, pt2;
                            if (row > 0) {
                                pt1 = adsk.core.Point3D.create(col*step, (row-1)*step, imageHeightData[col + (row-1)*img.height]);
                                pt2 = adsk.core.Point3D.create(col*step, row*step, zHeight);
                                lines.addByTwoPoints(pt1,pt2);
                            }
                            else {
                                if (col > 0) {
                                    pt1 = adsk.core.Point3D.create((col-1)*step, 0, imageHeightData[col-1]);
                                    pt2 = adsk.core.Point3D.create(col*step, 0, zHeight);
                                    lines.addByTwoPoints(pt1,pt2);
                                }
                            }

                            if (col > 0) {
                                pt1 = adsk.core.Point3D.create((col-1)*step, row*step, imageHeightData[(col-1) + row*img.height]);
                                pt2 = adsk.core.Point3D.create(col*step, row*step, zHeight);
                                lines.addByTwoPoints(pt1,pt2);
                            }
                            else {
                                if (row > 0) {
                                    pt1 = adsk.core.Point3D.create(0, (row-1)*step, imageHeightData[(row-1)*img.height]);
                                    pt2 = adsk.core.Point3D.create(0, row*step, zHeight);
                                    lines.addByTwoPoints(pt1,pt2);
                                }
                            }
                        }
                    }
                }
            }
            catch (e) {

                retVal = false;
                ui.messageBox('Image2Surface Script Failed : ' + (e.description ? e.description : e));
            }

            sketch.isComputeDeferred = false;

        } // SKETCH_POINTS and LINES

        // Failed to create sketch?
        if (!retVal) {

            // Remove sketch if we failed to load data
            if (sketch) {
                sketch.deleteMe();
                sketch = null;
            }
        }

        return retVal;
	}

	try {

        // First prompt for the image filename
        var dlg = ui.createFileDialog();
        dlg.title = 'Select Image File';
        dlg.filter = 'Image Files (*.jpeg;*.jpg;*.png;*.gif);;All Files (*.*)';
        if (dlg.showOpen() == adsk.core.DialogResults.DialogOK) {
            
            var imgFilename = dlg.filename;

            // Holds height data from image
            var imageHeightData = null;

            // Holds loaded image.
            var theImage = new Image();

            var imgData = adsk.readFile(imgFilename);
            if (!imgData) {
                ui.messageBox("Unable to load the image file: " + imgFilename);
            }
            else {

                // Get extension of filename
                var imgFileExt = imgFilename.split('.').pop().toLowerCase();
                if (imgFileExt === "jpg") {
                    imgFileExt = "jpeg";
                }

                // Convert binary back to base64
                var imgDataBase64 = "data:image/"+imgFileExt+";base64," + adsk.toBase64(imgData);

                // and load it into the image
                theImage.src = imgDataBase64;

                // Create and run command
                var command = createCommandDefinition();
                var commandCreatedEvent = command.commandCreated;
                commandCreatedEvent.add(onCommandCreated);

                command.execute();
            }
        }
        else {
            adsk.terminate();
        }
    }
    catch (e) {
        if (ui) {
            ui.messageBox('Image2Surface Script Failed : ' + (e.description ? e.description : e));
            adsk.terminate();
        }
    }
}
