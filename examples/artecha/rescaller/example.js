define(function(require, exports, module) {
    var Engine     = require("famous/core/Engine");
    var Surface    = require("famous/core/Surface");
    var Rescaller = require('famous/artecha/RescallerView');
    var Timer = require('famous/utilities/Timer');
    var Transform = require('famous/core/Transform');

    var mainContext = Engine.createContext();

    var rescaller = new Rescaller({
        initState: Transform.translate(0, 10, 0),
        endState: Transform.translate(0,200, 0)
    });
    var surfaces = [];

        var surface = new Surface({
             content: "Surface: " + (5 + 1),
             size: [200, 200],
             properties: {
                 backgroundColor: "hsl(" + (5 * 360 / 40) + ", 100%, 50%)",
                 lineHeight: "200px",
                 textAlign: "center"
             }
        });

        surface.pipe(rescaller);




    mainContext.add(rescaller);

    rescaller.set(surface);
});
