#Author-Hans Kellner
#Description-This is an Autodesk Fusion script that's used for generating surfaces from images.
#Copyright (C) 2015-2026 Hans Kellner: https://github.com/hanskellner/Fusion360Image2Surface
#MIT License: See https://github.com/hanskellner/Fusion360Image2Surface/LICENSE.md

import adsk.core, adsk.fusion, adsk.cam, traceback
import json, tempfile, platform, os

# global set of event handlers to keep them referenced for the duration of the command
handlers = []
_app = adsk.core.Application.cast(None)
_ui = adsk.core.UserInterface.cast(None)


# Return the active design's default length unit as a string ('mm', 'cm', 'm',
# 'in', 'ft'). The palette UI uses this to label and scale its controls so the
# user works in the document's units rather than always millimeters.
def documentLengthUnit():
    try:
        design = adsk.fusion.Design.cast(_app.activeProduct)
        if design:
            return design.unitsManager.defaultLengthUnits
    except:
        pass
    return 'mm'


# Map a unit string to the matching MeshUnits enum used when importing the OBJ.
# The OBJ vertices are authored numerically in the document's units (see the
# HTML/JS side), so the mesh must be imported with the corresponding unit.
def meshUnitFor(unitStr):
    unitMap = {
        'mm': adsk.fusion.MeshUnits.MillimeterMeshUnit,
        'cm': adsk.fusion.MeshUnits.CentimeterMeshUnit,
        'm':  adsk.fusion.MeshUnits.MeterMeshUnit,
        'in': adsk.fusion.MeshUnits.InchMeshUnit,
        'ft': adsk.fusion.MeshUnits.FootMeshUnit
    }
    # Fusion's internal database length unit is centimeters - a safe fallback.
    return unitMap.get(unitStr, adsk.fusion.MeshUnits.CentimeterMeshUnit)


# Push the current document length unit to the palette's HTML/JS so it can
# relabel and rescale its controls. Mirrors the Voronoi add-in's push model
# (returnData from incomingFromHTML round-trips as a JS Promise, so it is not
# used here).
def sendUnitsToPalette(palette):
    try:
        unitJson = json.dumps({ 'unit': documentLengthUnit() })
        if palette:
            palette.sendInfoToHTML('units', unitJson)   # async push (received by fusionJavaScriptHandler)
        return unitJson
    except:
        return json.dumps({ 'unit': 'mm' })

# Event handler for the commandExecuted event.
class ShowPaletteCommandExecuteHandler(adsk.core.CommandEventHandler):
    def __init__(self):
        super().__init__()
    def notify(self, args):
        try:

            global _app, _ui
            
            # Verify that in parametric design mode
            design = _app.activeProduct
            if design.designType != adsk.fusion.DesignTypes.ParametricDesignType:
                _ui.messageBox('The "Image2Surface" command must be run in parametric modeling mode.\n\nPlease enable "Capture design history" for your document.')
                return

            # Create and display the palette.
            palette = _ui.palettes.itemById('Image2SurfacePalette')
            if not palette:
                # NOTE: do NOT add a ?v= query to this local HTML path - Fusion
                # treats it as a literal filename and fails to load (blank page).
                # The ?v= cache-busting lives only on the <script>/<link> tags.
                palette = _ui.palettes.add('Image2SurfacePalette', 'Image2Surface', 'image2surface.html', True, True, True, 1200, 800)

                # Float the palette.
                palette.dockingState = adsk.core.PaletteDockingStates.PaletteDockStateFloating
    
                # Add handler to HTMLEvent of the palette.
                onHTMLEvent = MyHTMLEventHandler()
                palette.incomingFromHTML.add(onHTMLEvent)
                handlers.append(onHTMLEvent)
    
                # Add handler to CloseEvent of the palette.
                onClosed = MyCloseEventHandler()
                palette.closed.add(onClosed)
                handlers.append(onClosed)
            else:
                palette.isVisible = True
                # The page is already loaded (it won't re-fire its 'ready'
                # handshake), so push the current document units now in case the
                # active document - and thus its units - changed since last show.
                sendUnitsToPalette(palette)
        except:
            _ui.messageBox('Command executed failed: {}'.format(traceback.format_exc()))


# Event handler for the commandCreated event.
class ShowPaletteCommandCreatedHandler(adsk.core.CommandCreatedEventHandler):
    def __init__(self):
        super().__init__()              
    def notify(self, args):
        try:
            command = args.command
            onExecute = ShowPaletteCommandExecuteHandler()
            command.execute.add(onExecute)
            handlers.append(onExecute)
        except:
            _ui.messageBox('Failed:\n{}'.format(traceback.format_exc()))


# Event handler for the commandExecuted event.
class SendInfoCommandExecuteHandler(adsk.core.CommandEventHandler):
    def __init__(self):
        super().__init__()
    def notify(self, args):
        try:
            # Send information to the palette. This will trigger an event in the javascript
            # within the html so that it can be handled.
            palette = _ui.palettes.itemById('Image2SurfacePalette')
            if palette:
                palette.sendInfoToHTML('send', 'This is a message sent to the palette from Fusion.')
        except:
            _ui.messageBox('Command executed failed: {}'.format(traceback.format_exc()))


# Event handler for the commandCreated event.
class SendInfoCommandCreatedHandler(adsk.core.CommandCreatedEventHandler):
    def __init__(self):
        super().__init__()              
    def notify(self, args):
        try:
            command = args.command
            onExecute = SendInfoCommandExecuteHandler()
            command.execute.add(onExecute)
            handlers.append(onExecute)   
        except:
            _ui.messageBox('Failed:\n{}'.format(traceback.format_exc()))


# Event handler for the palette close event.
class MyCloseEventHandler(adsk.core.UserInterfaceGeneralEventHandler):
    def __init__(self):
        super().__init__()
    def notify(self, args):
        try:
            # _ui.messageBox('Close button is clicked.')
            # Do nothing
            pass
        except:
            _ui.messageBox('Failed:\n{}'.format(traceback.format_exc()))


# Event handler for the palette HTML event.                
class MyHTMLEventHandler(adsk.core.HTMLEventHandler):
    def __init__(self):
        super().__init__()
    def notify(self, args):
        objFilePath = None
        try:
            htmlArgs = adsk.core.HTMLEventArgs.cast(args)
            data = json.loads(htmlArgs.data) if htmlArgs.data else {}

            global _app

            # The page sends exactly two kinds of message: the load/units
            # handshake (no 'obj' key) and a generate (carrying 'obj'). We key
            # off the payload SHAPE rather than the action string, because the
            # action is not surfaced reliably through
            # neutronJavaScriptObject.executeQuery (it can arrive empty), which
            # otherwise made the handshake look like a failed generate and
            # popped a spurious "Failed to generate mesh OBJ" dialog at startup.
            #
            # Handshake: reply with the document units and return. The units are
            # delivered BOTH ways (mirrors the working Voronoi add-in): pushed
            # async via sendInfoToHTML, and returned synchronously here as
            # returnData (the JS captures the send's return value too).
            if 'obj' not in data:
                htmlArgs.returnData = sendUnitsToPalette(_ui.palettes.itemById('Image2SurfacePalette'))
                return

            objStr = data.get('obj') or ''
            objStrLen = len(objStr)

            if objStrLen <= 0:
                _ui.messageBox('Failed to generate mesh OBJ')
                return

            # Get the current document, otherwise create a new one.
            doc = _app.activeDocument
            if not doc:
                doc = _app.documents.add(adsk.core.DocumentTypes.FusionDesignDocumentType)

            # 4.4: Make sure we actually have a valid, parametric design to
            # import into. The user may have closed all documents between
            # clicking "Generate Surface" and this callback firing.
            design = adsk.fusion.Design.cast(_app.activeProduct)
            if not design:
                _ui.messageBox('No active Fusion design was found.\n\nPlease open or create a design, then try again.')
                return

            if design.designType != adsk.fusion.DesignTypes.ParametricDesignType:
                _ui.messageBox('The "Image2Surface" command must be run in parametric modeling mode.\n\nPlease enable "Capture design history" for your document.')
                return

            # Write the OBJ out to a temp file for import.
            fp = tempfile.NamedTemporaryFile(mode='w', suffix='.obj', delete=False)
            fp.writelines(objStr)
            fp.close()
            objFilePath = fp.name
            print ("Generated OBJ File: " + objFilePath)

            # Get the root component of the active design.
            rootComp = design.rootComponent

            # Need to place the mesh in a BaseFeature (non-parametric)
            baseFeats = rootComp.features.baseFeatures
            baseFeat = baseFeats.add()
            baseFeat.startEdit()

            # Add a mesh body by importing this data (OBJ) file. The OBJ is
            # authored numerically in the document's units (the JS uses the unit
            # we pushed via 'units'), so import with the matching MeshUnits.
            meshList = rootComp.meshBodies.add(objFilePath, meshUnitFor(documentLengthUnit()), baseFeat)

            # Need to finish the base feature edit
            baseFeat.finishEdit()

            if meshList.count > 0:
                # Success - close palette
                palette = _ui.palettes.itemById('Image2SurfacePalette')
                if palette:
                    palette.isVisible = False

                # HACK: bug causes mesh to be placed away from origin
                # therefore zoom to fit so mesh appears to user
                vp = _app.activeViewport
                vp.fit()

                htmlArgs.returnData = 'OK'
            else:
                _ui.messageBox('Failed to generate mesh body from file: {}'.format(objFilePath))

        except:
            # 4.2: Surface the failure in the Fusion UI (e.g. malformed OBJ or a
            # face-count limit), not just to stderr where the user never sees it.
            if _ui:
                _ui.messageBox('Failed to import the generated surface:\n{}'.format(traceback.format_exc()))
        finally:
            # 4.3: Always clean up the temp OBJ file, whether the import
            # succeeded or raised.
            if objFilePath:
                try:
                    os.remove(objFilePath)
                except OSError:
                    pass


def run(context):
    try:
        global _ui, _app
        _app = adsk.core.Application.get()
        _ui  = _app.userInterface
        
        # Add a command that displays the panel.
        showPaletteCmdDef = _ui.commandDefinitions.itemById('showImage2SurfacePalette')
        if not showPaletteCmdDef:
            showPaletteCmdDef = _ui.commandDefinitions.addButtonDefinition('showImage2SurfacePalette', 'Show Image 2 Surface', '', './/Resources//image2surface')
            showPaletteCmdDef.toolClipFilename = './/Resources//image2surface//image2surface-tooltip.png'

            # Connect to Command Created event.
            onCommandCreated = ShowPaletteCommandCreatedHandler()
            showPaletteCmdDef.commandCreated.add(onCommandCreated)
            handlers.append(onCommandCreated)

        # Get the CREATE panel in the MODEL workspace. 
        createPanel = _ui.allToolbarPanels.itemById("SolidCreatePanel")

        # Add button to the panel
        btnControl = createPanel.controls.itemById('showImage2SurfacePalette')
        if not btnControl:
            btnControl = createPanel.controls.addCommand(showPaletteCmdDef)

            # Make the button available in the panel.
            btnControl.isPromotedByDefault = True
            btnControl.isPromoted = True
        
        if context['IsApplicationStartup'] is False:
            _ui.messageBox('The "Image2Surface" command has been added\nto the SOLID->CREATE panel dropdown of the DESIGN workspace.\n\nTo run the command, select the SOLID->CREATE dropdown\nthen select "Show Image 2 Surface".')
    except Exception:
        #pass
        if _ui:
            _ui.messageBox('Failed:\n{}'.format(traceback.format_exc()))


def stop(context):
    try:        
        # Delete the palette created by this add-in.
        palette = _ui.palettes.itemById('Image2SurfacePalette')
        if palette:
            palette.deleteMe()
            
        # Delete controls and associated command definitions created by this add-ins
        panel = _ui.allToolbarPanels.itemById('SolidScriptsAddinsPanel')
        cmd = panel.controls.itemById('showImage2SurfacePalette')
        if cmd:
            cmd.deleteMe()
        cmdDef = _ui.commandDefinitions.itemById('showImage2SurfacePalette')
        if cmdDef:
            cmdDef.deleteMe() 
    except:
        if _ui:
            _ui.messageBox('Failed:\n{}'.format(traceback.format_exc()))