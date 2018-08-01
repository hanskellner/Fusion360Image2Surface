#Author-Hans Kellner
#Description-This is an Autodesk Fusion 360 script that's used for generating surfaces from images.
#Copyright (C) 2015-2018 Hans Kellner: https://github.com/hanskellner/Fusion360Image2Surface
#MIT License: See https://github.com/hanskellner/Fusion360Image2Surface/LICENSE.md

import adsk.core, adsk.fusion, adsk.cam, traceback
import json, tempfile, platform

# global set of event handlers to keep them referenced for the duration of the command
handlers = []
_app = adsk.core.Application.cast(None)
_ui = adsk.core.UserInterface.cast(None)

# Event handler for the commandExecuted event.
class ShowPaletteCommandExecuteHandler(adsk.core.CommandEventHandler):
    def __init__(self):
        super().__init__()
    def notify(self, args):
        try:
            # Create and display the palette.
            palette = _ui.palettes.itemById('Image2SurfacePalette')
            if not palette:
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
            foo = 1
            if foo == 2:
                foo = 2
        except:
            _ui.messageBox('Failed:\n{}'.format(traceback.format_exc()))


# Event handler for the palette HTML event.                
class MyHTMLEventHandler(adsk.core.HTMLEventHandler):
    def __init__(self):
        super().__init__()
    def notify(self, args):
        try:
            htmlArgs = adsk.core.HTMLEventArgs.cast(args)            
            data = json.loads(htmlArgs.data)

            objStr = data['obj']
            objStrLen = len(data['obj'])

            if objStrLen > 0:

                fp = tempfile.NamedTemporaryFile(mode='w', suffix='.obj', delete=False)
                fp.writelines(objStr)
                fp.close()
                objFilePath = fp.name
                print ("Generated OBJ File: " + objFilePath)

                global _app

                # Get the current document, otherwise create a new one.
                doc = _app.activeDocument
                if not doc:
                    doc = _app.documents.add(adsk.core.DocumentTypes.FusionDesignDocumentType)
                
                design = _app.activeProduct

                # Get the root component of the active design.
                rootComp = design.rootComponent

                # Need to place the mesh in a BaseFeature (non-parametric)
                baseFeats = rootComp.features.baseFeatures
                baseFeat = baseFeats.add()
                baseFeat.startEdit()

                # Add a mesh body by importing this data (OBJ) file.
                meshList = rootComp.meshBodies.add(objFilePath, adsk.fusion.MeshUnits.MillimeterMeshUnit, baseFeat)
                if meshList.count > 0:

                    # JIRA: https://jira.autodesk.com/browse/UP-37174
                    # Translate the mesh back to the origin.
                    # TODO: Find position of mesh and use for tx back to origin
                    #vOrigin =  adsk.core.Vector3D.create(0.0, 0.0, 0.0)
                    #txOrigin = adsk.core.Matrix3D.create()
                    #txOrigin.translation = vOrigin

                    # Create a move feature
                    #moveMeshes = adsk.core.ObjectCollection.create()
                    #moveMeshes.add(meshList.item(0))
                    #moveFeats = rootComp.features.moveFeatures
                    #moveFeatureInput = moveFeats.createInput(moveMeshes, txOrigin)
                    #moveFeats.add(moveFeatureInput)
                    # END JIRA

                    # Success - close palette
                    palette = _ui.palettes.itemById('Image2SurfacePalette')
                    if palette:
                        palette.isVisible = False
                    
                    # Note: bug above causes mesh to be placed away from origin
                    # zoom to fit so mesh appears to user
                    vp = _app.activeViewport
                    vp.fit()
                else:
                    _ui.messageBox('Failed to generate mesh body from file: {}'.format(objFilePath))

                # Need to finish the base feature edit
                baseFeat.finishEdit()

            else:
                _ui.messageBox('Failed to generate mesh OBJ')

        except:
            _ui.messageBox('Failed:\n{}'.format(traceback.format_exc()))


def run(context):
    try:
        global _ui, _app
        _app = adsk.core.Application.get()
        _ui  = _app.userInterface
        
        # Add a command that displays the panel.
        showPaletteCmdDef = _ui.commandDefinitions.itemById('showImage2SurfacePalette')
        if not showPaletteCmdDef:
            #strTooltip = '<div style=\'font-family:"Calibri";color:#e0e0e0; padding-top:-10px; padding-bottom:10px;\'><span style=\'font-size:20px;\'><b>Image 2 Surface</b></span></div>Use this add-in to convert an image into a surface (mesh).'
            showPaletteCmdDef = _ui.commandDefinitions.addButtonDefinition('showImage2SurfacePalette', 'Show Image 2 Surface', '', './/Resources//image2surface')
            showPaletteCmdDef.toolClipFilename = './/Resources//image2surface//image2surface-tooltip.png'

            # Connect to Command Created event.
            onCommandCreated = ShowPaletteCommandCreatedHandler()
            showPaletteCmdDef.commandCreated.add(onCommandCreated)
            handlers.append(onCommandCreated)
        
        # Add the command to the toolbar.
        panel = _ui.allToolbarPanels.itemById('SolidScriptsAddinsPanel')
        cntrl = panel.controls.itemById('showImage2SurfacePalette')
        if not cntrl:
            panel.controls.addCommand(showPaletteCmdDef)
       
        if context['IsApplicationStartup'] is False:
            _ui.messageBox('The "Image2Surface" command has been added\nto the ADD-INS panel dropdown of the MODEL workspace.\n\nTo run the command, select the ADD-INS dropdown\nthen select "Show Image 2 Surface".')
    except:
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