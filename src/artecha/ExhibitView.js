/*
 *
 */

define(function(require, exports, module) {
    var EventHandler = require('../core/EventHandler');
    var OptionsManager = require('../core/OptionsManager');
    var RenderNode = require('../core/RenderNode');
    var Utility = require('../utilities/Utility');
    var Entity = require('../core/Entity');

    /**
     * Useful for quickly creating elements within applications
     *   with large event systems.  Consists of a RenderNode paired with
     *   an input EventHandler and an output EventHandler.
     *   Meant to be extended by the developer.
     *
     * @class View
     * @uses EventHandler
     * @uses OptionsManager
     * @uses RenderNode
     * @constructor
     */
    function ExhibitView(options) {
        this._node = new RenderNode();

        this._eventInput = new EventHandler();
        this._eventOutput = new EventHandler();
        EventHandler.setInputHandler(this, this._eventInput);
        EventHandler.setOutputHandler(this, this._eventOutput);

        this.options = Utility.clone(this.constructor.DEFAULT_OPTIONS || ExhibitView.DEFAULT_OPTIONS);
        this._optionsManager = new OptionsManager(this.options);

        if (options) this.setOptions(options);

        this._id = Entity.register(this);
    }

    ExhibitView.DEFAULT_OPTIONS = {
        defaultHeight: window.innerHeight * 0.45,
        defaultRatio: 2 / 3
    };

    /**
     * Look up options value by key
     * @method getOptions
     *
     * @param {string} key key
     * @return {Object} associated object
     */
    ExhibitView.prototype.getOptions = function getOptions(key) {
        return this._optionsManager.getOptions(key);
    };

    /*
     *  Set internal options.
     *  No defaults options are set in ExhibitView.
     *
     *  @method setOptions
     *  @param {Object} options
     */
    ExhibitView.prototype.setOptions = function setOptions(options) {
        this._optionsManager.patch(options);
    };

    /**
     * Add a child renderable to the view.
     *   Note: This is meant to be used by an inheriting class
     *   rather than from outside the prototype chain.
     *
     * @method add
     * @return {RenderNode}
     * @protected
     */
    ExhibitView.prototype.add = function add() {
        return this._node.add.apply(this._node, arguments);
    };

    ExhibitView.prototype.getSize = function getSize(size) {
        if (size) {
            return [size[1] * this.options.defaultRatio, size[1]];
        }
        return [this.options.defaultHeight * this.options.defaultRatio, this.options.defaultHeight];
    };

    ExhibitView.prototype.render = function render() {

        return this._id;
    };

    ExhibitView.prototype.commit = function commit(context) {
        var transform = context.transform;
        var opacity = context.opacity;
        var origin = context.origin;
        this._size = context.size;

        // console.log('transform: ' + transform[13] + ' size: ' + this._size);
        return {
            transform: transform,
            size: this.getSize(this._size),
            opacity: opacity,
            origin: origin,
            target: this._node.render()
        };
    };

    module.exports = ExhibitView;
});
