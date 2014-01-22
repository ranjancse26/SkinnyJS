(function($) {
    var OVERLAY_CLASS = ".tutorial-overlay";
    var VEIL_CLASS = ".tutorial-overlay-veil";
    var CANVAS_CLASS = ".tutorial-overlay-canvas";
    var TIP_CLASS = ".tutorial-overlay-tip";
    var CONTENT_CLASS = ".tutorial-overlay-content";
    var CLOSE_OVERLAY_CLASS = ".close-overlay";

    var DATA_AUTOLOAD_ATTR = "data-overlay-autoload";
    var DATA_ZINDEX_ATTR = "data-overlay-zindex";
    var DATA_HIDE_ON_CLICK_ATTR = "overlay-hideonclick";
    var DATA_TIP_TARGET_ATTR = "overlay-tip-target";
    var DATA_TIP_POSITION_ATTR = "overlay-tip-position";

    var DEFAULT_TIP_OFFSET = 10;
    var DEFAULT_TIP_COLOR = "#FFFFFF";
    var DEFAULT_TIP_POSITION = "north";

    // Default values
    $.tutorialOverlay.defaults = {
        zIndex: 10000, // Allow callers to participate in zIndex arms races
        //        destroyOnClose: false, // If true, the overlay DOM will be destroyed and all events removed when the overlay closes
        hideOnClick: true,
        autoLoad: false,
    };

    function TutorialOverlay(settings) {
        if (!settings) {
            settings = {};
        }
        this.settings = settings;

        $.proxyAll(this, "show", "hide", "destroy", "isShowing", "setHideOnClick", "addTip", "setCenterContent", "_render", "_renderTip", "_clickHandler");

        this._tips = [];

        var clickHide = $.tutorialOverlay.defaults.hideOnClick;
        if ((settings.hideOnClick !== undefined) && !settings.hideOnClick) {
            clickHide = settings.hideOnClick;
        }

        this._$overlay = settings.overlay;
        var centerContent = this._$overlay.find(CONTENT_CLASS);
        if (centerContent.length) {
            this.setCenterContent(centerContent);
        }

        this._$overlay.css("z-index", settings.zIndex);

        this._initializeTips();

        this.setHideOnClick(clickHide);
        var me = this;
        this._$overlay.on("click", CLOSE_OVERLAY_CLASS, function(e) {
            e.preventDefault();

            // Defer to the next tick of the event loop. It makes it more useful
            // to apply this class without having to worry if the close handler will
            // run before any other handlers.
            setTimeout(function() {
                me.hide();
            }, 0);
        });
    }

    // returns true iff the overlay is currently showing
    TutorialOverlay.prototype.isShowing = function() {
        return this._$overlay && this._$overlay.is(":visible");
    };

    // shows the overlay
    TutorialOverlay.prototype.show = function() {
        if (!this.isShowing()) {
            this._ensureVeil();
            this._ensureCanvas();

            var $win = $(window);
            this._$overlay.width($win.width());
            this._$overlay.height($win.height());
            this._render();
            this._$overlay.show();
        }
    };

    // hides the overlay
    TutorialOverlay.prototype.hide = function() {
        this._$overlay.hide();
        if (this.settings.destroyOnClose) {
            this.destroy();
            this._destroyed = true;
        }
    };

    TutorialOverlay.prototype.destroy = function() {
        this._$overlay.empty();
        this._$overlay.remove();
    };

    // set the hide-on-click behavior
    TutorialOverlay.prototype.setHideOnClick = function(hideOnClick) {
        this.hideOnClick = hideOnClick;

        this._$overlay.off("click", this._clickHandler);

        if (this.hideOnClick) {
            this._$overlay.on("click", this._clickHandler);
        }
    };

    // add a new Tip
    //  A Tip should have:
    //      content
    //      target
    //      relative position (optional)
    //      color (optional)
    //      offset (optional)
    TutorialOverlay.prototype.addTip = function(newTip) {
        this._tips.push({
            target: newTip.target,
            content: newTip.content,
            relativePos: newTip.position,
            color: newTip.color,
            offset: newTip.offset,
        });
    };

    // set the content to be displayed in the center of the overlay
    TutorialOverlay.prototype.setCenterContent = function(newCenterContent) {
        //TODO: repaint
        this._$centerContent = $(newCenterContent);
    };

    /*
     * Ensure that a 'veil' element exists in the overlay.  This is necessary to support older IE where transparency isn't supported.
     * The 'veil' will be translucent and capture click events.  All other elements in the overlay should be rendered on top of it.
     */
    TutorialOverlay.prototype._ensureVeil = function() {
        if (!this._$veil) {
            var $veil = this._$overlay.find(VEIL_CLASS);
            if (!$veil.length) {
                //create and add a veil div
                $veil = $("<div class='" + VEIL_CLASS.substring(1) + "''></div>");
                this._$overlay.prepend($veil);

                //if (this.hideOnClick) {
                //    $veil.on("click", this._clickHandler);
                //}
            }
        }
        this._$veil = $veil;
    };

    TutorialOverlay.prototype._ensureCanvas = function() {
        if (!this._$canvas) {
            var $canvas = this._$overlay.find("canvas" + CANVAS_CLASS);
            if (!$canvas.length) {
                $canvas = $("<canvas width='1024' height='1024' class='" + CANVAS_CLASS.substring(1) + "'></canvas>");
                this._$overlay.append($canvas);
                if (typeof(G_vmlCanvasManager) != "undefined") {
                    G_vmlCanvasManager.initElement($canvas[0]);
                }
                //if (this.hideOnClick) {
                //    $canvas.on("click", this._clickHandler);
                //}
            }
        }
        this._$canvas = $canvas;
    };

    TutorialOverlay.prototype._initializeTips = function() {
        if (this._$overlay) {
            //find tips in DOM
            var domTips = this._$overlay.find(TIP_CLASS);
            var tips = this._tips;
            $.each(domTips, function() {
                var $tipEl = $(this);
                tips.push({
                    target: $tipEl.data(DATA_TIP_TARGET_ATTR),
                    relativePos: $tipEl.data(DATA_TIP_POSITION_ATTR),
                    content: this,
                    color: $tipEl.data("overlay-tip-color"),
                    offset: $tipEl.data("overlay-tip-offset"),
                });
            });
        }
    };

    TutorialOverlay.prototype._render = function() {
        var me = this;

        var context = this._$canvas[0].getContext("2d");
        //Ensure canvas fills the entire window
        var $win = $(window);
        var windowWidth = $win.width();
        var windowHeight = $win.height();
        context.canvas.width = windowWidth;
        context.canvas.height = windowHeight;

        //TODO: If tip targets need to be highlighted via cutting of the veil:
        //      1) use fillRect to paint the translucent veil on the canvas INSTEAD OF CSS background-color on the overlay component
        //      2) cut holes in the veil by filling the bounding box of the target in the canvas with 'destination-out' compositing.
        //Fill the entire canvas with a translucent veil.
        //context.fillStyle = "rgba(0, 0, 0, 0.6)";
        //context.fillRect(0, 0, context.canvas.width, context.canvas.height);

        //In order to measure the content and tips for proper positioning:
        //  1) set the overlay to visibility:hidden
        //  2) measure everything
        //  3) set the overlay to display:none to prevent reflows while positioning
        //  4) position everything
        //  5) show the overlay

        // Make sure all tips are in the overlay element before trying to calculate their size and positions:
        $.each(this._tips, function() {
            if (!this.$tip) {
                this.$tip = $(this.content);
            }
            if (!$.contains(me._$overlay[0], this.$tip[0])) {
                me._$overlay.append(this.$tip);
            }
        });

        // 1) Make the overlay available to the browser's layout calculations:
        this._$overlay.css({
            visibility: "hidden",
            display: "block"
        });

        // 2) Measure everything and calculate positions
        //      (Since there's no good way to get a unique hash for the tip and content elements, use an array and index instead of a hashtable.)
        //      Set up an array of clientRect
        //      Calculate the centerContent's size and store it in the array
        //      For each tip, calculate it's size and store it in the array
        var sizes = [];
        var sizeIndex = 0;
        if (this._$centerContent) {
            this._$centerContent.sizeIndex = sizeIndex++;
            sizes[this._$centerContent.sizeIndex] = this._$centerContent.clientRect();
        }
        $.each(this._tips, function() {
            this.sizeIndex = sizeIndex++;
            sizes[this.sizeIndex] = this.$tip.clientRect();
        });

        // 3) Remove the overlay from the flow calculations
        this._$overlay.css({
            display: "none",
            visibility: "visible"
        });

        // 4) Move everything to their new positions
        //      Position the center content
        //      Position each tip

        //Center content
        if (this._$centerContent) {
            var rect = sizes[this._$centerContent.sizeIndex];

            var contentX = (windowWidth - rect.width) / 2;
            var contentY = (windowHeight - rect.height) / 2;

            this._$centerContent.css({
                position: "absolute",
                top: contentY + "px",
                left: contentX + "px"
            });
        }

        //For each tip:
        //  position tip relative to target
        //  add tip content at absolute position
        $.each(this._tips, function() {
            me._renderTip(this, sizes[this.sizeIndex], context);
        });

        // 5) Show the overlay
        this._$overlay.show();
    };

    TutorialOverlay.prototype._renderTip = function(tip, tipRect, canvasContext) {
        //calculate the position of the tip
        var $tipTarget = $(tip.target);
        if (!tip.$tip) {
            tip.$tip = $(tip.content);
        }
        var $tipContent = tip.$tip;
        if (!$tipTarget.length || !$tipTarget.is(":visible")) {
            //Don't show the tip if we can't find the target.
            $tipContent.hide();
            return;
        }

        var positionStr = tip.relativePos;
        if (!positionStr) {
            positionStr = DEFAULT_TIP_POSITION;
        }
        var pos = this._decodePosition(positionStr);
        var offset = tip.offset;
        if (!offset) {
            offset = DEFAULT_TIP_OFFSET;
        }

        var points = this._calculatePosition(tipRect, $tipTarget.clientRect(), pos, offset);

        //Set the tip's position
        var tipLocation = points.tipLocation;
        $tipContent.css({
            position: "absolute",
            top: tipLocation.y + "px",
            left: tipLocation.x + "px"
        }).show();

        this._renderArrow(points.startPt, points.endPt, tip.color, canvasContext);
    };

    TutorialOverlay.prototype._renderArrow = function(startPt, endPt, color, canvasContext) {
        canvasContext.beginPath();
        if (!color) {
            color = DEFAULT_TIP_COLOR;
        }
        canvasContext.strokeStyle = color;

        //draw curve from startPt to endPt
        var controlPt = {
            x: startPt.x,
            y: endPt.y
        };
        canvasContext.moveTo(startPt.x, startPt.y);
        canvasContext.quadraticCurveTo(controlPt.x, controlPt.y, endPt.x, endPt.y);

        //draw tip of arrow
        var headlen = 10; // length of head in pixels
        var dx = endPt.x - controlPt.x;
        var dy = endPt.y - controlPt.y;
        var angle;
        if (dx === 0) {
            angle = Math.PI / 2;
            if (startPt.y > endPt.y) {
                angle *= 3;
            }
        } else {
            angle = Math.atan2(dy, dx);
        }
        canvasContext.lineTo(
            endPt.x - headlen * Math.cos(angle - Math.PI / 6),
            endPt.y - headlen * Math.sin(angle - Math.PI / 6)
        );
        canvasContext.moveTo(endPt.x, endPt.y);
        canvasContext.lineTo(
            endPt.x - headlen * Math.cos(angle + Math.PI / 6),
            endPt.y - headlen * Math.sin(angle + Math.PI / 6)
        );

        canvasContext.stroke();
    };

    TutorialOverlay.prototype._clickHandler = function(e) {
        //Ignore clicks in the centerContent element and its descendants.
        //  TODO: there has to be a better way to do this.
        if (!(this._$centerContent && $.contains(this._$centerContent[0], e.target))) {
            this.hide();
        }
    };

    TutorialOverlay.prototype._decodePosition = function(positionStr) {
        var posObj = {
            verticalCenter: true,
            horizontalCenter: true
        };
        var pos = positionStr.match(/north|east|south|west|top|right|bottom|left/gi);
        if (pos) {
            //Use only the last two entries in the array of matches
            pos = pos.slice(Math.max(pos.length - 2, 0));
            $.each(pos, function() {
                switch (this.toLowerCase()) {
                    case "north":
                    case "top":
                        posObj.above = true;
                        posObj.verticalCenter = false;
                        break;

                    case "south":
                    case "bottom":
                        posObj.above = false;
                        posObj.verticalCenter = false;
                        break;

                    case "east":
                    case "right":
                        posObj.right = true;
                        posObj.horizontalCenter = false;
                        break;

                    case "west":
                    case "left":
                        posObj.right = false;
                        posObj.horizontalCenter = false;
                        break;
                }
            });
        }
        return posObj;
    };

    TutorialOverlay.prototype._calculatePosition = function(tipRect, targetRect, pos, offset) {
        var startPt = {},
            endPt = {},
            tipLocation = {};

        //TODO: Fix the positioning code
        if (pos.above) {
            //north
            startPt.y = targetRect.top - offset;
            endPt.y = targetRect.top;
            tipLocation.y = startPt.y - tipRect.height;
        } else if (pos.verticalCenter) {
            //center
            startPt.y = targetRect.top + (targetRect.height / 2);
            endPt.y = startPt.y;
            tipLocation.y = targetRect.top + ((targetRect.height - tipRect.height) / 2);
        } else {
            //south
            startPt.y = targetRect.bottom + offset;
            endPt.y = targetRect.bottom;
            tipLocation.y = startPt.y;
        }
        if (pos.right) {
            //east
            startPt.x = targetRect.right + offset;
            endPt.x = targetRect.right;
            tipLocation.x = startPt.x;
        } else if (pos.horizontalCenter) {
            //center
            startPt.x = targetRect.left + (targetRect.width / 2);
            endPt.x = startPt.x;
            tipLocation.x = targetRect.left + ((targetRect.width - tipRect.width) / 2);
        } else {
            //west
            startPt.x = targetRect.left - offset;
            endPt.x = targetRect.left;
            tipLocation.x = startPt.x - tipRect.width;
        }

        return {
            startPt: startPt,
            endPt: endPt,
            tipLocation: tipLocation
        };
    };

    //Takes a settings object and calculates derived settings.
    //Settings go in order:

    // 1. default value
    // 2. settings passed
    var ensureSettings = function(explicitSettings) {
        var settings = $.extend({}, $.tutorialOverlay.defaults);

        // Read settings specified on the target node's custom HTML attributes
        if (explicitSettings.overlay) {
            var $target = $(explicitSettings.overlay);
            var targetSettings = $.tutorialOverlay.getSettings($target);
            $.extend(settings, targetSettings);
        }

        // The explicitly specified settings take precedence
        $.extend(settings, explicitSettings);
        return settings;
    };

    // Public sub-namespace for modal dialogs.
    $.tutorialOverlay = $.tutorialOverlay || {};

    // Creates a new dialog from the specified settings.
    $.tutorialOverlay.create = function(settings) {
        settings = ensureSettings(settings);

        var overlay;

        // Validate that there isn't an existing overlay open using the same content
        if (settings.overlay) {
            var existingOverlay = $(settings.overlay).tutorialOverlayInstance();

            if (existingOverlay &&
                existingOverlay.isShowing()) {
                throw new Error("An attempt was made to create a tutorial overlay with a node which is already assigned to another open overlay.");
            }
        }
        if (settings.overlay) {
            var $overlay = $(settings.overlay);
            if ($overlay.length === 0) {
                throw new Error("Tutorial overlay not found.");
            }

            settings.overlay = $overlay;

            overlay = new TutorialOverlay(settings);

            //if (!settings.destroyOnClose) {
            $overlay.tutorialOverlayInstance(overlay);
            //}
        }
        if (!overlay) {
            throw new Error("No content node specified.")
        }

        return overlay;
    };

    var JQUERY_DATA_KEY = "tutorialOverlay";

    $.fn.tutorialOverlayInstance = function(overlay) {
        return !overlay ? this.data(JQUERY_DATA_KEY) : this.data(JQUERY_DATA_KEY, overlay);
    };

    // Idiomatic jQuery interface for tutorial overlays.
    $.fn.tutorialOverlay = function(settings) {
        var overlay;

        // If the first argument is a string, it is a method name to call on the overlay
        // associated with the DOM element.
        if (typeof settings == "string") {
            var action = settings;
            overlay = this.tutorialOverlayInstance();
            if (overlay && overlay[action]) {
                overlay[action].apply(overlay, Array.prototype.slice(arguments, 1));
            }
        }
        // Otherwise, create a new overlay.
        else {
            settings = settings || {};
            settings.overlay = this[0];

            overlay = $.tutorialOverlay.create(settings);

            overlay.show();
        }

        return this;
    };

})(jQuery);