define(function(require, exports, module) {
    'use strict';

    var Engine = require('../core/Engine');
    var Entity = require('../core/Entity');
    var EventHandler = require('../core/EventHandler');
    var OptionsManager = require('../core/OptionsManager');
    var SpecParser = require('../core/SpecParser');
    var Transform = require('../core/Transform');

    var PhysicsEngine = require('../physics/PhysicsEngine');
    var Particle = require('../physics/bodies/Particle');
    var Drag = require('../physics/forces/Drag');
    var Spring = require('../physics/forces/Spring');

    var GenericSync = require('../inputs/GenericSync');
    var TouchSync = require('../inputs/TouchSync');
    GenericSync.register({touch: TouchSync});

    var State = {
        INITIAL: 0,
        END: 1
    };

    function PaperScrollView(options) {
        // 1. setup default options
        this.options = Object.create(PaperScrollView.DEFAULT_OPTIONS);
        this._optionsManager = new OptionsManager(this.options);
        this.setOptions(options);

        // 2. Iniitalize eventing
        this._eventInput = new EventHandler();
        EventHandler.setInputHandler(this, this._eventInput);
        this._eventOutput = new EventHandler();
        EventHandler.setOutputHandler(this, this._eventOutput);

        this.sync = new GenericSync(['touch'], this.options.sync);
        this._eventInput.pipe(this.sync);
        this.sync.pipe(this._eventInput);

        // 3. Initialize the Physics Engine
        this._physicsEngine = new PhysicsEngine();

        this._rescaler = {};
        this._rescaler.body = new Particle(this.options.particle.body);
        this._physicsEngine.addBody(this._rescaler.body);
        this._rescaler.forceAgent = -1;
        this._rescaler.force = new Spring(this.options.particle.spring);

        this._scroller = {};
        this._scroller.body = new Particle(this.options.particle.body);
        this._physicsEngine.addBody(this._scroller.body);
        this._scroller.dragAgent = -1;
        this._scroller.drag = new Drag(this.options.particle.drag);
        this._scroller.frictionAgent = -1;
        this._scroller.friction = new Drag(this.options.particle.friction);

        this._selectedIndex = -1;
        this._leftVisibleIndex = 0;
        this._positionCache = [];
        this._activeState = State.INITIAL;
        _setCurrentPosition.call(this, [this.options.initialPosition[12], this.options.initialPosition[13]]);

        _bindEvents.call(this);

        //
        this._entityId = Entity.register(this);
    }

    PaperScrollView.DEFAULT_OPTIONS = {
        scale: 0.5,
        particle : {
            body: {
            // use defaults
            },
            drag: {
                forceFunction: Drag.FORCE_FUNCTIONS.QUADRATIC,
                strength: 0.0001,
                disabled: true
            },
            friction: {
                forceFunction: Drag.FORCE_FUNCTIONS.LINEAR,
                strength: 0.05,
                disabled: false
            },
            spring: {
                dampingRatio: 1.0,
                period: 350
            }
        }
    };

    function _bindEvents() {
        this._eventInput.bindThis(this);
        this._eventInput.on('start', _handleStart);
        this._eventInput.on('update', _handleMove);
        this._eventInput.on('end', _handleEnd);

        this._particle.body.on('end', function() {
            Engine.nextTick(function () {
                _dettachAgents.call(this);
            }.bind(this));
        }.bind(this));
    }

    function _handleStart(event) {
        // 1. Disconnect all bodies from the engine
        _dettachAgents.call(this, true, true, true);
        this._touchMove = true;

        // 3. Clear all edge state

        if (!this.stories) return;

        this._relativeTouchPosition = {};

        var normalizedClientX = event.clientX;
        for (var i = this._leftVisibleIndex, l = this.stories.length; i < l; i++) {
            var cachePosition = this._positionCache[i];
            if (event.clientX < cachePosition[12] + cachePosition[0]) {
                this._selectedIndex = i;
                if (cachePosition[12] < 0) {
                    normalizedClientX -= cachePosition[12];
                }
                this._relativeTouchPosition.x = normalizedClientX;
                this._relativeTouchPosition.width = cachePosition[0];
                break;
            } else {
                if (cachePosition[12] < 0) {
                    normalizedClientX -= cachePosition[0] + cachePosition[12];
                } else {
                    normalizedClientX -= cachePosition[0];
                }
            }
        }
    }

    function _handleMove(event) {
        var delta = event.delta;

        var position = _getCurrentPosition.call(this);

        var scale = 1;
        if (position[1] > this.options.initialPosition[13]) {
            scale = this.options.scale;
        }

        position[0] += delta[0];
        position[1] += delta[1] * scale;

        _setCurrentPosition.call(this, position);
    }

    function _handleEnd(event) {
        _handleMove.call(this, event);

        this._selectedIndex = -1;

        var delta = event.delta;
        var velocity = event.velocity;
        var switchState = false;

        var position = _getCurrentPosition.call(this);

        var currentPosition,
            nextPosition;
        if (this._activeState === State.INITIAL) {
            currentPosition = Transform.getTranslate(this.options.initialPosition);
            nextPosition = Transform.getTranslate(this.options.finalPosition);
        } else {
            currentPosition = Transform.getTranslate(this.options.finalPosition);
            nextPosition = Transform.getTranslate(this.options.initialPosition);
        }

        var velocityMagnitude = Math.abs(velocity[1]);
        if (velocityMagnitude >= this.options.pageSwitchSpeed) {
            var distance = currentPosition[1] - nextPosition[1];
            var distanceMagnitude = Math.abs(distanceVector);

            var velocityDistance = Math.abs(distance - velocity[1]);

            if (velocityDistance > distanceMagnitude) {
                switchState = true;
            }
        }

        if (!switchState) {
            var distanceFromCurrent = Math.abs(position[1] - currentPosition[1]);
            var distanceToNext = Math.abs(position[1] - nextPosition[1]);

            if (distanceToNext < distanceFromCurrent) {
                switchState = true;
            }
        }

        var activeState;
        if (switchState) {
            if (this._activeState === State.INITIAL) {
                this._activeState = State.END;
                activeState = this.options.finalPosition;
            } else {
                this._activeState = State.INITIAL;
                activeState = this.options.initialPosition;
            }
        } else if (this._activeState === State.INITIAL) {
            activeState = Transform.copy(this.options.initialPosition)
            activeState[12] = undefined;
        } else {
            activeState = this.options.finalPosition;
        }

        _attachSpring.call(this, activeState, velocity);
        this._touchMove = false;
    }

    function _attachSpring(transform, velocity) {
        this._particle.springAgent = this._physicsEngine.attach(this._particle.spring, this._particle.body);
        this._particle.spring.setOptions({
            anchor: [transform[12], transform[13]]
        });
        this._particle.body.setVelocity(velocity);
    }

    function _dettachAgents(spring, drag, friction, velocity) {
        if (this._particle.springAgent !== -1) {
            this._physicsEngine.detach(this._particle.springAgent);
            this._particle.springAgent = -1;
        }
        if (this._particle.dragAgent !== -1) {
            this._physicsEngine.detach(this._particle.dragAgent);
            this._particle.dragAgent = -1;
        }
        if (this._particle.frictionAgent !== -1) {
            this._physicsEngine.detach(this._particle.frictionAgent);
            this._particle.frictionAgent = -1;
        }
        this._particle.body.setVelocity([0, 0, 0]);
    }

    function _getCurrentPosition(integrate) {
        var position = this._particle.body.getPosition();
        return _copy3DVectorOrZero(position);
    }

    function _setCurrentPosition(position) {
        position = _copy3DVectorOrZero(position);
        this._particle.body.setPosition(position);
    }

    // Vector functions -- Can be moved to util

    function _copy3DVectorOrZero(vector) {
        if (vector) {
            return [vector[0] || 0,
                    vector[1] || 0,
                    vector[2] || 0];
        }
        return [0, 0, 0];
    }

    // API

    PaperScrollView.prototype.sequenceFrom = function sequenceFrom(array) {
        var arrayCopy = [];
        for (var i = 0, l = array.length; i < l; i++) {
            arrayCopy[i] = array[i];
        }

        this.stories = arrayCopy;
    };

    PaperScrollView.prototype.setOptions = function setOptions(options) {
        if (!options) return;

        // patch custom options
        this._optionsManager.setOptions(options);

        // sub-components

        if (this._particle && this._particle.spring) {
            if (options.particle.spring) this._particle.spring.setOptions(options.particle.spring);
        }

        if (this.sync) {
            if (options.sync.rails !== undefined) this.sync.setOptions({rails: options.sync.rails});
        }
    };

    // Internal API

    PaperScrollView.prototype.render = function render() {

        return this._entityId;
    };

    PaperScrollView.prototype.commit = function commit(commitParams, context, cacheStorage) {
        if (!this.stories) return;

        // Integrate the y position
        var position = this._particle.body.getPosition();

        // Determine the height of the story
        var height = this.options.initialPosition[13] + this.options.initialPosition[5] - position[1];

        var width;
        if (height - this.options.initialPosition[5] > 0.00001) {
            var finalRatio = this.options.finalAspectRatio;
            // what percent of the final height are we
            var finalHeight = this.options.finalPosition[5];
            var percent = (height - finalHeight) / finalHeight;
            // if we are getting larger, scale to the screen ratio
            width = (finalRatio + (finalRatio - this.options.defaultAspectRatio) * percent) * height;
            // console.log('ratio: ' + (width/height));
        } else {
            width = this.options.defaultAspectRatio * height;
        }

        // Calculate the size of each story
        var size = [width, height, 0];

        // Find the selected element or the first visible
        var focusIndex = 0;
        if (this._selectedIndex !== -1) {
            focusIndex = this._selectedIndex;
        } else if (this._leftVisibleIndex !== -1) {
            focusIndex = this._leftVisibleIndex;
        }

        // Get the position of the focused element or the initial position
        var focusPosition = this._positionCache[focusIndex];
        if (focusPosition === undefined) {
            focusPosition = this.options.initialPosition;
        }

        var leadingEdgeDiff = 0;
        // if the height changed, adjust the x position to compensate and keep things centered
        if (Math.abs(focusPosition[5] - height) > 0.00001) {
            // waht is the difference in size
            leadingEdgeDiff = (focusPosition[0] - size[0]) * focusIndex;
            leadingEdgeDiff += (focusPosition[0] - size[0]) * (this._relativeTouchPosition.x / this._relativeTouchPosition.width);
            // need to update the spring location
            var springPosition = this._particle.spring.options.anchor || [0, 0];
            springPosition[0] += leadingEdgeDiff;
            this._particle.spring.setOptions({
                anchor: springPosition
            });

            position[0] += leadingEdgeDiff;
            this._particle.body.setPosition(position);
        }

        var totalWidth = 0;
        var transform = commitParams.transform;

        this._leftVisibleIndex = -1;
        // For each story
        for (var i = 0, l = this.stories.length; i < l; i++) {
            var story = this.stories[i];
            var storyTransform = Transform.translate(position[0] + totalWidth, position[1]);
            totalWidth += size[0];

            // When the story actually renders, what info does it need to have?
            var commitResult = {transform: Transform.multiply(transform, storyTransform), size: size, target: story.render()};

            var cachePosition = Transform.scale(size[0], size[1], size[2]);
            cachePosition = Transform.thenMove(cachePosition, [storyTransform[12], storyTransform[13], storyTransform[14]]);
            this._positionCache[i] = cachePosition;

            if (this._leftVisibleIndex === -1) {
                if (cachePosition[12] + cachePosition[0] > 0) {
                    this._leftVisibleIndex = i;
                }
            }

            var storySpec = SpecParser.parse(commitResult, context);
            // Should never contain more than 1 key
            var keys = Object.keys(storySpec);
            for (var j = 0; j < keys.length; j++) {
                var id = keys[j];
                var storyNode = Entity.get(id);
                var storyParams = storySpec[id];
                storyParams.allocator = context.allocator;
                // from this result you should be able to retrieve the size
                var storyResult = storyNode.commit(storyParams, context, cacheStorage);
                if (storyResult) _applyCommit(storyResult, context, cacheStorage);
                else cacheStorage[id] = storyParams;
            }
        }
    };

    function _applyCommit(spec, context, cacheStorage) {
        var result = SpecParser.parse(spec, context);
        var keys = Object.keys(result);
        for (var i = 0; i < keys.length; i++) {
            var id = keys[i];
            var childNode = Entity.get(id);
            var commitParams = result[id];
            commitParams.allocator = context.allocator;
            var commitResult = childNode.commit(commitParams, context, cacheStorage);
            if (commitResult) _applyCommit(commitResult, context, cacheStorage);
            else cacheStorage[id] = commitParams;
        }
    }

    module.exports = PaperScrollView;
});
