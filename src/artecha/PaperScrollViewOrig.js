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
        this.xphysicsEngine = new PhysicsEngine();
        this.yphysicsEngine = new PhysicsEngine();

        this.xParticle = {};
        this.xParticle.body = new Particle(this.options.particle.body);
        this.xphysicsEngine.addBody(this.xParticle.body);
        this.xParticle.springAgent = -1;
        this.xParticle.spring = new Spring(this.options.particle.spring);
        this.xParticle.dragAgent = -1;
        this.xParticle.drag = new Drag(this.options.particle.drag);
        this.xParticle.frictionAgent = -1;
        this.xParticle.friction = new Drag(this.options.particle.friction);

        this.yParticle = {};
        this.yParticle.body = new Particle(this.options.particle.body);
        this.yphysicsEngine.addBody(this.yParticle.body);
        this.yParticle.springAgent = -1;
        this.yParticle.spring = new Spring(this.options.particle.spring);
        this.yParticle.dragAgent = -1;
        this.yParticle.drag = new Drag(this.options.particle.drag);
        this.yParticle.frictionAgent = -1;
        this.yParticle.friction = new Drag(this.options.particle.friction);

        this._selectedIndex = -1;
        this._leftVisibleIndex = 0;
        this._positionCache = [];
        this._activeState = State.INITIAL;
        _setCurrentPosition.call(this, [this.options.initialPosition[12], this.options.initialPosition[13]]);

        _bindEvents.call(this);

        this.roundedDifference = [0, 0, 0];

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

        this.yParticle.body.on('end', function() {
            console.log('end-y');
            Engine.nextTick(function () {
                if (this.yParticle.springAgent !== -1) {
                    this.yphysicsEngine.detach(this.yParticle.springAgent);
                    this.yParticle.springAgent = -1;
                }
            }.bind(this));
        }.bind(this));

        this.xParticle.body.on('end', function() {
            console.log('end-x');
            Engine.nextTick(function () {
                // if (this.xParticle.springAgent !== -1) {
                //     this._physicsEngine.detach(this.xParticle.springAgent);
                //     this.xParticle.springAgent = -1;
                // }
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
        var velocity = event.velocity;

        var currentPosition,
            nextPosition;
        if (this._activeState === State.INITIAL) {
            currentPosition = _getTransformPositionVector(this.options.initialPosition);
            nextPosition = _getTransformPositionVector(this.options.finalPosition);
        } else {
            currentPosition = _getTransformPositionVector(this.options.finalPosition);
            nextPosition = _getTransformPositionVector(this.options.initialPosition);
        }

        var position = _getCurrentPosition.call(this);

        var newPosition = [position[0] + delta[0], position[1] + delta[1]];
        var distanceFromCurrent = _getPositionDifference(newPosition, currentPosition);
        var distanceToNext = _getPositionDifference(newPosition, nextPosition);

        var scale = 1;
        if (newPosition[1] > this.options.initialPosition[13]) {
            scale = this.options.scale;
        }

        position[0] += delta[0];
        position[1] += delta[1] * scale;

        _setCurrentPosition.call(this, position);
    }

    function _handleEnd(event) {
        this._selectedIndex = -1;

        var delta = event.delta;
        var velocity = event.velocity;
        var switchState = false;

        var position = _getCurrentPosition.call(this);
        position[0] += delta[0];
        position[1] += delta[1];
        _setCurrentPosition.call(this, position);

        var currentPosition,
            nextPosition;
        if (this._activeState === State.INITIAL) {
            currentPosition = _getTransformPositionVector(this.options.initialPosition);
            nextPosition = _getTransformPositionVector(this.options.finalPosition);
        } else {
            currentPosition = _getTransformPositionVector(this.options.finalPosition);
            nextPosition = _getTransformPositionVector(this.options.initialPosition);
        }

        var velocityMagnitude = _getPositionDifference(velocity);
        if (velocityMagnitude >= this.options.pageSwitchSpeed) {
            var distanceVector = [currentPosition[0] - nextPosition[0], currentPosition[1] - nextPosition[1]];
            var distanceMagnitude = _getPositionDifference(distanceVector);

            var velocityDistance = _getPositionDifference(distanceVector, velocity);

            if (velocityDistance > distanceMagnitude) {
                switchState = true;
            }
        }

        if (!switchState) {
            var distanceFromCurrent = _getPositionDifference(position, currentPosition);
            var distanceToNext = _getPositionDifference(position, nextPosition);

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
            activeState = this.options.initialPosition;
        } else {
            activeState = this.options.finalPosition;
        }

        _attachSpring.call(this, this._activeState, activeState);

        _setCurrentVelocity.call(this, velocity);
        this._touchMove = false;
    }

    function _attachSpring(state, transform) {
        if (state === State.INITIAL) {
            this.yParticle.springAgent = this.yphysicsEngine.attach(this.yParticle.spring, this.yParticle.body);
        } else if (state === State.END) {
            this.xParticle.springAgent = this.xphysicsEngine.attach(this.xParticle.spring, this.xParticle.body);
            this.yParticle.springAgent = this.yphysicsEngine.attach(this.yParticle.spring, this.yParticle.body);
        }

        this.xParticle.spring.setOptions({
            anchor: [transform[12], 0],
            dampingRatio: this.options.particle.spring.dampingRatio,
            period: this.options.particle.spring.period
        });

        this.yParticle.spring.setOptions({
            anchor: [0, transform[13]],
            dampingRatio: this.options.particle.spring.dampingRatio,
            period: this.options.particle.spring.period
        });
    }

    function _attachAgents(spring, drag, friction) {
        var xParticle = this.xParticle;
        if (spring && xParticle.springAgent === -1) {

        }
        if (drag && xParticle.dragAgent === -1) {
            xParticle.dragAgent = this.xphysicsEngine.attach(xParticle.drag, xParticle.body);
        }
        if (friction && xParticle.frictionAgent === -1) {
            xParticle.frictionAgent = this.xphysicsEngine.attach(xParticle.friction, xParticle.body);
        }
        var yParticle = this.yParticle;
        if (spring && yParticle.springAgent === -1) {

        }
        if (drag && yParticle.dragAgent === -1) {
            yParticle.dragAgent = this.yphysicsEngine.attach(yParticle.drag, yParticle.body);
        }
        if (friction && yParticle.frictionAgent === -1) {
            yParticle.frictionAgent = this.yphysicsEngine.attach(yParticle.friction, yParticle.body);
        }
    }

    function _dettachAgents(spring, drag, friction) {
        if (spring && this.xParticle.springAgent !== -1) {
            this.xphysicsEngine.detach(this.xParticle.springAgent);
            this.xParticle.springAgent = -1;
        }
        if (drag && this.xParticle.dragAgent !== -1) {
            this.xphysicsEngine.detach(this.xParticle.dragAgent);
            this.xParticle.dragAgent = -1;
        }
        if (friction && this.xParticle.frictionAgent !== -1) {
            this.xphysicsEngine.detach(this.xParticle.frictionAgent);
            this.xParticle.frictionAgent = -1;
        }

        if (spring && this.yParticle.springAgent !== -1) {
            this.yphysicsEngine.detach(this.yParticle.springAgent);
            this.yParticle.springAgent = -1;
        }
        if (drag && this.yParticle.dragAgent !== -1) {
            this.yphysicsEngine.detach(this.yParticle.dragAgent);
            this.yParticle.dragAgent = -1;
        }
        if (friction && this.yParticle.frictionAgent !== -1) {
            this.yphysicsEngine.detach(this.yParticle.frictionAgent);
            this.yParticle.frictionAgent = -1;
        }
    }

    function _getCurrentPosition(integrate) {
        var position = [0, 0, 0];
        position[0] = this.xParticle.body.position.x;
        position[1] = this.yParticle.body.position.y;
        return position;
    }

    function _setCurrentPosition(position) {
        position = _copy3DVectorOrZero(position);
        this._integratedPostion = position;
        this.xParticle.body.setPosition([position[0], 0, 0]);
        this.yParticle.body.setPosition([0, position[1], 0]);
    }

    function _getCurrentVelocity() {

        //
    }

    function _setCurrentVelocity(velocity) {
        velocity = _copy3DVectorOrZero(velocity);
        this.xParticle.body.setVelocity([velocity[0], 0, 0]);
        this.yParticle.body.setVelocity([0, velocity[1], 0]);
    }

    // Vector functions -- Can be moved to util

    function _copy3DVectorOrZero(vector) {
        var newVector = [0, 0, 0];
        if (vector) {
            newVector[0] = vector[0] || 0;
            newVector[1] = vector[1] || 0;
            newVector[2] = vector[2] || 0;
        }

        return newVector;
    }

    function _getTransformPositionVector(transform) {
        var positionVector = [0, 0, 0];
        positionVector[0] = transform[12];
        positionVector[1] = transform[13];
        positionVector[2] = transform[14];
        return positionVector;
    }

    function _getPositionDifference(v1, v2) {
        v2 = v2 || [0, 0];
        return Math.sqrt(Math.pow(v1[0] - v2[0], 2) + Math.pow(v1[1] - v2[1], 2));
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
        var oldY = this.lastY || 0;
        var position = this.yParticle.body.getPosition();
        this.lastY = position[1];
        if (Math.abs(oldY - this.lastY) < 0.000001) {
            if (this.yParticle.springAgent !== -1) {
                this.yphysicsEngine.detach(this.yParticle.springAgent);
                this.yParticle.springAgent = -1;
            }
        }

        // position[1] = Math.round(position[1]);
        // this.yParticle.body.position.y = position[1];

        // 4. Determine the height of the story
        var height = this.options.initialPosition[13] + this.options.initialPosition[5] - position[1];


        var width;
        // if (height === this.options.initialPosition[5]) {
        //     width = this.options.initialPosition[0];
        // } else if (height === this.options.finalPosition[5]) {
        //     width = this.options.finalPosition[0];
        // } else
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
            var springPosition = this.xParticle.spring.lastPosition || [0, 0];
            // springPosition[0] += leadingEdgeDiff;
            // var wasattached = false;
            // if (this.xParticle.springAgent !== -1) {
            //     wasattached = true;
            //     this.xphysicsEngine.detach(this.xParticle.springAgent);
            //     this.xParticle.springAgent = -1;
            // }
            // var xpos = this.xParticle.body.getPosition();
            // xpos[0] += leadingEdgeDiff;
            // this.xParticle.body.setPosition(xpos);
            // var oldvel = this.lastVel || [0];
            // var xvel = this.xParticle.body.getVelocity();
            // this.lastVel = xvel;
            // console.log('vel: ' + (oldvel[0] - xvel[0]));
            // if (wasattached) {
            //     this.xParticle.springAgent = this.xphysicsEngine.attach(this.xParticle.spring, this.xParticle.body);
            //     this.xParticle.body.setVelocity(xvel);
            // }


            // this.xParticle.spring.setOptions({
            //     anchor: springPosition,
            //     dampingRatio: this.options.particle.spring.dampingRatio,
            //     period: this.options.particle.spring.period
            // });
            // console.log('Diff xParticle: ' + this.xParticle.body.position.x + ' leadingEdge: ' + leadingEdgeDiff);
        }

        // Add the rounded difference for more accuracy
        // this.xParticle.body.position.x += this.roundedDifference[0];
        position[0] = this.xParticle.body.getPosition()[0];
        // position[0] = Math.round(position[0]);
        // this.xParticle.body.x = position[0];

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
