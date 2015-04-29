define(function(require, exports, module) {
    'use strict';

    var Engine = require('../core/Engine');
    var Entity = require('../core/Entity');
    var EventHandler = require('../core/EventHandler');
    var Transform = require('../core/Transform');
    var OptionsManager = require('../core/OptionsManager');
    var PhysicsEngine = require('../physics/PhysicsEngine');
    var Particle = require('../physics/bodies/Particle');
    var Spring = require('../physics/forces/Spring');
    var Utility = require('../utilities/Utility');


    var GenericSync = require('../inputs/GenericSync');
    var ScrollSync = require('../inputs/ScrollSync');
    var TouchSync = require('../inputs/TouchSync');
    GenericSync.register({scroll: ScrollSync, touch: TouchSync});

    var State = {
        INITIAL: 0,
        END: 1
    };

    function RescalerView(options) {
        this.options = Object.create(RescalerView.DEFAULT_OPTIONS);
        this._optionsManager = new OptionsManager(this.options);
        this.setOptions(options || {});

        this._eventInput = new EventHandler();
        this._eventOutput = new EventHandler();

        EventHandler.setInputHandler(this, this._eventInput);
        EventHandler.setOutputHandler(this, this._eventOutput);

        this._entityId = Entity.register(this);

        this.sync = new GenericSync(this.options.syncs,
            {
                direction : this.options.direction,
                rails: this.options.rails
            });

        this._physicsEngine = new PhysicsEngine();
        this._particle = new Particle();
        this._physicsEngine.addBody(this._particle);

        this._springAgent = -1;
        this.spring = new Spring();
        this.spring.setOptions({
            period: this.options.period,
            dampingRatio: this.options.damp
        });

        // eventing
        this._eventInput.pipe(this.sync);
        this.sync.pipe(this._eventInput);

        this._states = [];
        this._states[State.INITIAL] = this.options.initState;
        this._states[State.END] = this.options.endState;
        this._activeState = State.INITIAL;
        _setPosition.call(this, [this.options.initState[12], this.options.initState[13]]);

        _bindEvents.call(this);
    }

    RescalerView.DEFAULT_OPTIONS = {
        syncs: ['scroll', 'touch'],
        rails: true,
        direction: Utility.Direction.Y,
        scale: 0.5,
        pageSwitchSpeed: 0.5,
        period: 300,
        damp: 1,

        initState: {}, // transform
        endState: {} // transform
    };

    function _bindEvents() {
        this._eventInput.bindThis(this);
        this._eventInput.on('start', _handleStart);
        this._eventInput.on('update', _handleMove);
        this._eventInput.on('end', _handleEnd);

        this._particle.on('end', function() {
            Engine.nextTick(function () {
                if (!this._touchMove) {
                    _detachSpring.call(this);
                }
            }.bind(this));
        }.bind(this));
    }

    function _handleStart(event) {
        // console.log('$START');
        _detachSpring.call(this);
        this._touchMove = true;
    }

    function _handleMove(event) {
        // console.log('$MOVE');
        var delta = [0, 0];
        var velocity = [0, 0];
        if (this.options.direction === Utility.Direction.X) {
            delta[0] = event.delta;
            velocity[0] = event.velocity;
        } else if (this.options.direction === Utility.Direction.Y) {
            delta[1] = event.delta;
            velocity[1] = event.velocity;
        } else {
            delta[0] = event.delta[0];
            delta[1] = event.delta[1];
            velocity[0] = event.velocity[0];
            velocity[1] = event.velocity[1];
        }

        var state = this._activeState,
            nextState;
        if (state === State.INITIAL) {
            nextState = State.END;
        } else {
            nextState = State.INITIAL;
        }
        var currentVector = [this._states[this._activeState][12], this._states[this._activeState][13]];
        var nextVector = [this._states[nextState][12], this._states[nextState][13]];

        var currPos = _getPosition.call(this);
        var newPos = [currPos[0] + delta[0], currPos[1] + delta[1]];

        var currentToNext = _vectorize(currentVector, nextVector);
        var posToNext = _vectorize(newPos, nextVector);

        var scale;
        if (currentToNext < posToNext) {
            scale = this.options.scale;
        } else {
            scale = 1;
        }

        currPos = _getPosition.call(this);
        currPos[0] += delta[0] * scale;
        currPos[1] += delta[1] * scale;

        _setPosition.call(this, currPos);
    }

    function _handleEnd(event) {
        var delta = _getPosition.call(this);
        var velocity = [0, 0];
        if (this.options.direction === Utility.Direction.X) {
            delta[0] += event.delta;
            velocity[0] += event.velocity;
        } else if (this.options.direction === Utility.Direction.Y) {
            delta[1] += event.delta;
            velocity[1] += event.velocity;
        } else {
            delta[0] += event.delta[0];
            delta[1] += event.delta[1];
            velocity[0] += event.velocity[0];
            velocity[1] += event.velocity[1];
        }
        _setPosition.call(this, delta);

        var state = this._activeState,
            nextState,
            switchState = false;
        if (state === State.INITIAL) {
            nextState = State.END;
        } else {
            nextState = State.INITIAL;
        }
        var currentVector = [this._states[this._activeState][12], this._states[this._activeState][13]];
        var nextVector = [this._states[nextState][12], this._states[nextState][13]];

        var velFromCurrent = _vectorize(velocity, currentVector);
        var velFromNext = _vectorize(velocity, nextVector);

        var velVector = _vectorize(velocity);
        if (velVector >= this.options.pageSwitchSpeed) {
            var distVector = [currentVector[0] - nextVector[0], currentVector[1] - nextVector[1]];
            var dist = _vectorize(distVector);
            var velDist = _vectorize(distVector, velocity);
            if (velDist > dist) {
                switchState = true;
            }
        }

        if (!switchState) {
            var posToCurrent = _vectorize(delta, currentVector);
            var posToNext = _vectorize(delta, nextVector);

            if (posToNext < posToCurrent) {
                switchState = true;
            }
        }

        if (switchState) {
            if (this._activeState === State.INITIAL) {
                this._activeState = State.END;
            } else {
                this._activeState = State.INITIAL;
            }
        }

        var transitionState = this._states[this._activeState];
        _attachSpring.call(this, transitionState);

        this._touchVelocity = null;
        _setVelocity.call(this, velocity);
        this._touchMove = false;
    }

    function _attachSpring(transform) {
        if (this._springAgent === -1) {
            this._springAgent = this._physicsEngine.attach(this.spring, this._particle);
        }

        var springOptions = this.spring.options;
        springOptions.anchor = [transform[12], transform[13]];
        this.spring.setOptions(springOptions);
    }

    function _detachSpring() {
        if (this._springAgent >= 0) {
            this._physicsEngine.detach(this._springAgent);
            this._springAgent = -1;
        }
    }

    function _getPosition() {
        // Particle.getPosition should only be called on the commit
        return this._commitPosition || [0, 0];
    }

    function _setPosition(position) {
        this._commitPosition = position;
        this._particle.setPosition(position);
    }

    function _getVelocity() {
        if (this._touchVelocity) {
            return this._touchVelocity;
        }
        return this._particle.getVelocity();
    }

    function _setVelocity(v) {

        this._particle.setVelocity(v);
    }

    function _vectorize(v1, v2) {

        v2 = v2 || [0, 0];
        return Math.sqrt(Math.pow(v1[0] - v2[0], 2) + Math.pow(v1[1] - v2[1], 2));
    }

    RescalerView.prototype.set = function set(node) {

        this._node = node;
    };

    RescalerView.prototype.setOptions = function setOptions(options) {
        if (!options) return;

        if (options.direction === 'x' || options.direction === Utility.Direction.X) options.direction = Utility.Direction.X;
        else if (options.direction === 'y' || options.direction === Utility.Direction.Y) options.direction = Utility.Direction.Y;
        else if ('direction' in options) options.direction = undefined;

        // patch custom options
        this._optionsManager.setOptions(options);

        // sub-components

        if (this.spring) {
            if (options.period) this.spring.setOptions({period: options.period});
            if (options.damping) this.spring.setOptions({period: options.dampingRatio});
        }

        if (this.sync) {
            if (options.rails !== undefined) this.sync.setOptions({rails: options.rails});
            if ('direction' in options) this.sync.setOptions({direction: options.direction});
            if (options.syncScale !== undefined) this.sync.setOptions({scale: options.scale});
        }
    };

    // Internal API

    RescalerView.prototype.render = function render() {
        if (!this._node) return null;
        return this._entityId;
    };

    RescalerView.prototype.commit = function commit(context) {
        var transform = context.transform;
        var opacity = context.opacity;
        var origin = context.origin;
        this._size = context.size;

        // Particle.getPosition should only be called on the commit
        var position = this._particle.getPosition();
        if (this._touchMove) {
            position = this._commitPosition;
        }
        this._commitPosition = position;
        var scalledTransform = Transform.translate(position[0], position[1]);



        return {
            transform: Transform.multiply(transform, scalledTransform),
            size: this._size,
            opacity: opacity,
            origin: origin,
            target: this._node.render()
        };
    };

    module.exports = RescalerView;
});
