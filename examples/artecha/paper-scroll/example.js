/**
 * Copyright (c) 2014 Famous Industries, Inc.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
 * IN THE SOFTWARE.
 *
 * @license MIT
 */

/**
 * Scrollview
 * ------------
 *
 * Scrollview is one of the core views in Famo.us. Scrollview
 * will lay out a collection of renderables sequentially in
 * the specified direction, and will allow you to scroll
 * through them with mousewheel or touch events.
 *
 * In this example, we have a Scrollview that sequences over
 * a collection of surfaces that vary in color
 */
define(function(require, exports, module) {
    var Engine     = require("famous/core/Engine");
    var Surface    = require("famous/core/Surface");
    var PaperScrollView = require("famous/artecha/PaperScrollView");
    var Timer = require('famous/utilities/Timer');

    var Transform = require('famous/core/Transform');

    var mainContext = Engine.createContext();

    var y = Math.round(window.innerHeight * 0.55);
    var height = window.innerHeight - y;
    var width = Math.round(height * 2 / 3);

    var initialPosition = Transform.scale(width, height, 0);
    initialPosition = Transform.thenMove(initialPosition, [0, y, 0]);

    var finalPosition = Transform.scale(window.innerWidth, window.innerHeight, 0);

    var options = {
        initialPosition: initialPosition,
        finalPosition: finalPosition,
        defaultAspectRatio: (2 / 3),
        finalAspectRatio: (window.innerWidth / window.innerHeight),
        totalWidth: window.innerWidth
    }

    var scrollview = new PaperScrollView(options);
    var surfaces = [];

    for (var i = 0, temp; i < 40; i++) {
        temp = new Surface({
             content: "Surface: " + (i + 1),
             properties: {
                 backgroundColor: "hsl(" + (i * 360 / 5) + ", 100%, 50%)",
                 lineHeight: "200px",
                 textAlign: "center"
             }
        });

        temp.pipe(scrollview);
        surfaces.push(temp);
    }
    scrollview.sequenceFrom(surfaces);




    mainContext.add(scrollview);

});
