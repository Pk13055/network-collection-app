var app = (function () {
  'use strict';

  function noop() { }
  const identity = x => x;
  function assign(tar, src) {
      // @ts-ignore
      for (const k in src)
          tar[k] = src[k];
      return tar;
  }
  function run(fn) {
      return fn();
  }
  function blank_object() {
      return Object.create(null);
  }
  function run_all(fns) {
      fns.forEach(run);
  }
  function is_function(thing) {
      return typeof thing === 'function';
  }
  function safe_not_equal(a, b) {
      return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
  }
  function subscribe(store, ...callbacks) {
      if (store == null) {
          return noop;
      }
      const unsub = store.subscribe(...callbacks);
      return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
  }
  function component_subscribe(component, store, callback) {
      component.$$.on_destroy.push(subscribe(store, callback));
  }
  function create_slot(definition, ctx, $$scope, fn) {
      if (definition) {
          const slot_ctx = get_slot_context(definition, ctx, $$scope, fn);
          return definition[0](slot_ctx);
      }
  }
  function get_slot_context(definition, ctx, $$scope, fn) {
      return definition[1] && fn
          ? assign($$scope.ctx.slice(), definition[1](fn(ctx)))
          : $$scope.ctx;
  }
  function get_slot_changes(definition, $$scope, dirty, fn) {
      if (definition[2] && fn) {
          const lets = definition[2](fn(dirty));
          if (typeof $$scope.dirty === 'object') {
              const merged = [];
              const len = Math.max($$scope.dirty.length, lets.length);
              for (let i = 0; i < len; i += 1) {
                  merged[i] = $$scope.dirty[i] | lets[i];
              }
              return merged;
          }
          return $$scope.dirty | lets;
      }
      return $$scope.dirty;
  }
  function exclude_internal_props(props) {
      const result = {};
      for (const k in props)
          if (k[0] !== '$')
              result[k] = props[k];
      return result;
  }
  function action_destroyer(action_result) {
      return action_result && is_function(action_result.destroy) ? action_result.destroy : noop;
  }

  const is_client = typeof window !== 'undefined';
  let now = is_client
      ? () => window.performance.now()
      : () => Date.now();
  let raf = is_client ? cb => requestAnimationFrame(cb) : noop;

  const tasks = new Set();
  function run_tasks(now) {
      tasks.forEach(task => {
          if (!task.c(now)) {
              tasks.delete(task);
              task.f();
          }
      });
      if (tasks.size !== 0)
          raf(run_tasks);
  }
  /**
   * Creates a new task that runs on each raf frame
   * until it returns a falsy value or is aborted
   */
  function loop(callback) {
      let task;
      if (tasks.size === 0)
          raf(run_tasks);
      return {
          promise: new Promise(fulfill => {
              tasks.add(task = { c: callback, f: fulfill });
          }),
          abort() {
              tasks.delete(task);
          }
      };
  }

  function append(target, node) {
      target.appendChild(node);
  }
  function insert(target, node, anchor) {
      target.insertBefore(node, anchor || null);
  }
  function detach(node) {
      node.parentNode.removeChild(node);
  }
  function element(name) {
      return document.createElement(name);
  }
  function text(data) {
      return document.createTextNode(data);
  }
  function space() {
      return text(' ');
  }
  function empty() {
      return text('');
  }
  function listen(node, event, handler, options) {
      node.addEventListener(event, handler, options);
      return () => node.removeEventListener(event, handler, options);
  }
  function attr(node, attribute, value) {
      if (value == null)
          node.removeAttribute(attribute);
      else if (node.getAttribute(attribute) !== value)
          node.setAttribute(attribute, value);
  }
  function set_attributes(node, attributes) {
      // @ts-ignore
      const descriptors = Object.getOwnPropertyDescriptors(node.__proto__);
      for (const key in attributes) {
          if (attributes[key] == null) {
              node.removeAttribute(key);
          }
          else if (key === 'style') {
              node.style.cssText = attributes[key];
          }
          else if (descriptors[key] && descriptors[key].set) {
              node[key] = attributes[key];
          }
          else {
              attr(node, key, attributes[key]);
          }
      }
  }
  function children(element) {
      return Array.from(element.childNodes);
  }
  function set_data(text, data) {
      data = '' + data;
      if (text.data !== data)
          text.data = data;
  }
  function custom_event(type, detail) {
      const e = document.createEvent('CustomEvent');
      e.initCustomEvent(type, false, false, detail);
      return e;
  }
  class HtmlTag {
      constructor(html, anchor = null) {
          this.e = element('div');
          this.a = anchor;
          this.u(html);
      }
      m(target, anchor = null) {
          for (let i = 0; i < this.n.length; i += 1) {
              insert(target, this.n[i], anchor);
          }
          this.t = target;
      }
      u(html) {
          this.e.innerHTML = html;
          this.n = Array.from(this.e.childNodes);
      }
      p(html) {
          this.d();
          this.u(html);
          this.m(this.t, this.a);
      }
      d() {
          this.n.forEach(detach);
      }
  }

  let stylesheet;
  let active = 0;
  let current_rules = {};
  // https://github.com/darkskyapp/string-hash/blob/master/index.js
  function hash(str) {
      let hash = 5381;
      let i = str.length;
      while (i--)
          hash = ((hash << 5) - hash) ^ str.charCodeAt(i);
      return hash >>> 0;
  }
  function create_rule(node, a, b, duration, delay, ease, fn, uid = 0) {
      const step = 16.666 / duration;
      let keyframes = '{\n';
      for (let p = 0; p <= 1; p += step) {
          const t = a + (b - a) * ease(p);
          keyframes += p * 100 + `%{${fn(t, 1 - t)}}\n`;
      }
      const rule = keyframes + `100% {${fn(b, 1 - b)}}\n}`;
      const name = `__svelte_${hash(rule)}_${uid}`;
      if (!current_rules[name]) {
          if (!stylesheet) {
              const style = element('style');
              document.head.appendChild(style);
              stylesheet = style.sheet;
          }
          current_rules[name] = true;
          stylesheet.insertRule(`@keyframes ${name} ${rule}`, stylesheet.cssRules.length);
      }
      const animation = node.style.animation || '';
      node.style.animation = `${animation ? `${animation}, ` : ``}${name} ${duration}ms linear ${delay}ms 1 both`;
      active += 1;
      return name;
  }
  function delete_rule(node, name) {
      node.style.animation = (node.style.animation || '')
          .split(', ')
          .filter(name
          ? anim => anim.indexOf(name) < 0 // remove specific animation
          : anim => anim.indexOf('__svelte') === -1 // remove all Svelte animations
      )
          .join(', ');
      if (name && !--active)
          clear_rules();
  }
  function clear_rules() {
      raf(() => {
          if (active)
              return;
          let i = stylesheet.cssRules.length;
          while (i--)
              stylesheet.deleteRule(i);
          current_rules = {};
      });
  }

  let current_component;
  function set_current_component(component) {
      current_component = component;
  }
  function get_current_component() {
      if (!current_component)
          throw new Error(`Function called outside component initialization`);
      return current_component;
  }
  function onMount(fn) {
      get_current_component().$$.on_mount.push(fn);
  }
  function afterUpdate(fn) {
      get_current_component().$$.after_update.push(fn);
  }
  function onDestroy(fn) {
      get_current_component().$$.on_destroy.push(fn);
  }
  function createEventDispatcher() {
      const component = get_current_component();
      return (type, detail) => {
          const callbacks = component.$$.callbacks[type];
          if (callbacks) {
              // TODO are there situations where events could be dispatched
              // in a server (non-DOM) environment?
              const event = custom_event(type, detail);
              callbacks.slice().forEach(fn => {
                  fn.call(component, event);
              });
          }
      };
  }
  function setContext(key, context) {
      get_current_component().$$.context.set(key, context);
  }
  function getContext(key) {
      return get_current_component().$$.context.get(key);
  }
  // TODO figure out if we still want to support
  // shorthand events, or if we want to implement
  // a real bubbling mechanism
  function bubble(component, event) {
      const callbacks = component.$$.callbacks[event.type];
      if (callbacks) {
          callbacks.slice().forEach(fn => fn(event));
      }
  }

  const dirty_components = [];
  const binding_callbacks = [];
  const render_callbacks = [];
  const flush_callbacks = [];
  const resolved_promise = Promise.resolve();
  let update_scheduled = false;
  function schedule_update() {
      if (!update_scheduled) {
          update_scheduled = true;
          resolved_promise.then(flush);
      }
  }
  function add_render_callback(fn) {
      render_callbacks.push(fn);
  }
  function add_flush_callback(fn) {
      flush_callbacks.push(fn);
  }
  const seen_callbacks = new Set();
  function flush() {
      do {
          // first, call beforeUpdate functions
          // and update components
          while (dirty_components.length) {
              const component = dirty_components.shift();
              set_current_component(component);
              update(component.$$);
          }
          while (binding_callbacks.length)
              binding_callbacks.pop()();
          // then, once components are updated, call
          // afterUpdate functions. This may cause
          // subsequent updates...
          for (let i = 0; i < render_callbacks.length; i += 1) {
              const callback = render_callbacks[i];
              if (!seen_callbacks.has(callback)) {
                  // ...so guard against infinite loops
                  seen_callbacks.add(callback);
                  callback();
              }
          }
          render_callbacks.length = 0;
      } while (dirty_components.length);
      while (flush_callbacks.length) {
          flush_callbacks.pop()();
      }
      update_scheduled = false;
      seen_callbacks.clear();
  }
  function update($$) {
      if ($$.fragment !== null) {
          $$.update();
          run_all($$.before_update);
          const dirty = $$.dirty;
          $$.dirty = [-1];
          $$.fragment && $$.fragment.p($$.ctx, dirty);
          $$.after_update.forEach(add_render_callback);
      }
  }

  let promise;
  function wait() {
      if (!promise) {
          promise = Promise.resolve();
          promise.then(() => {
              promise = null;
          });
      }
      return promise;
  }
  function dispatch(node, direction, kind) {
      node.dispatchEvent(custom_event(`${direction ? 'intro' : 'outro'}${kind}`));
  }
  const outroing = new Set();
  let outros;
  function group_outros() {
      outros = {
          r: 0,
          c: [],
          p: outros // parent group
      };
  }
  function check_outros() {
      if (!outros.r) {
          run_all(outros.c);
      }
      outros = outros.p;
  }
  function transition_in(block, local) {
      if (block && block.i) {
          outroing.delete(block);
          block.i(local);
      }
  }
  function transition_out(block, local, detach, callback) {
      if (block && block.o) {
          if (outroing.has(block))
              return;
          outroing.add(block);
          outros.c.push(() => {
              outroing.delete(block);
              if (callback) {
                  if (detach)
                      block.d(1);
                  callback();
              }
          });
          block.o(local);
      }
  }
  const null_transition = { duration: 0 };
  function create_in_transition(node, fn, params) {
      let config = fn(node, params);
      let running = false;
      let animation_name;
      let task;
      let uid = 0;
      function cleanup() {
          if (animation_name)
              delete_rule(node, animation_name);
      }
      function go() {
          const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
          if (css)
              animation_name = create_rule(node, 0, 1, duration, delay, easing, css, uid++);
          tick(0, 1);
          const start_time = now() + delay;
          const end_time = start_time + duration;
          if (task)
              task.abort();
          running = true;
          add_render_callback(() => dispatch(node, true, 'start'));
          task = loop(now => {
              if (running) {
                  if (now >= end_time) {
                      tick(1, 0);
                      dispatch(node, true, 'end');
                      cleanup();
                      return running = false;
                  }
                  if (now >= start_time) {
                      const t = easing((now - start_time) / duration);
                      tick(t, 1 - t);
                  }
              }
              return running;
          });
      }
      let started = false;
      return {
          start() {
              if (started)
                  return;
              delete_rule(node);
              if (is_function(config)) {
                  config = config();
                  wait().then(go);
              }
              else {
                  go();
              }
          },
          invalidate() {
              started = false;
          },
          end() {
              if (running) {
                  cleanup();
                  running = false;
              }
          }
      };
  }

  const globals = (typeof window !== 'undefined' ? window : global);
  function outro_and_destroy_block(block, lookup) {
      transition_out(block, 1, 1, () => {
          lookup.delete(block.key);
      });
  }
  function update_keyed_each(old_blocks, dirty, get_key, dynamic, ctx, list, lookup, node, destroy, create_each_block, next, get_context) {
      let o = old_blocks.length;
      let n = list.length;
      let i = o;
      const old_indexes = {};
      while (i--)
          old_indexes[old_blocks[i].key] = i;
      const new_blocks = [];
      const new_lookup = new Map();
      const deltas = new Map();
      i = n;
      while (i--) {
          const child_ctx = get_context(ctx, list, i);
          const key = get_key(child_ctx);
          let block = lookup.get(key);
          if (!block) {
              block = create_each_block(key, child_ctx);
              block.c();
          }
          else if (dynamic) {
              block.p(child_ctx, dirty);
          }
          new_lookup.set(key, new_blocks[i] = block);
          if (key in old_indexes)
              deltas.set(key, Math.abs(i - old_indexes[key]));
      }
      const will_move = new Set();
      const did_move = new Set();
      function insert(block) {
          transition_in(block, 1);
          block.m(node, next);
          lookup.set(block.key, block);
          next = block.first;
          n--;
      }
      while (o && n) {
          const new_block = new_blocks[n - 1];
          const old_block = old_blocks[o - 1];
          const new_key = new_block.key;
          const old_key = old_block.key;
          if (new_block === old_block) {
              // do nothing
              next = new_block.first;
              o--;
              n--;
          }
          else if (!new_lookup.has(old_key)) {
              // remove old block
              destroy(old_block, lookup);
              o--;
          }
          else if (!lookup.has(new_key) || will_move.has(new_key)) {
              insert(new_block);
          }
          else if (did_move.has(old_key)) {
              o--;
          }
          else if (deltas.get(new_key) > deltas.get(old_key)) {
              did_move.add(new_key);
              insert(new_block);
          }
          else {
              will_move.add(old_key);
              o--;
          }
      }
      while (o--) {
          const old_block = old_blocks[o];
          if (!new_lookup.has(old_block.key))
              destroy(old_block, lookup);
      }
      while (n)
          insert(new_blocks[n - 1]);
      return new_blocks;
  }

  function get_spread_update(levels, updates) {
      const update = {};
      const to_null_out = {};
      const accounted_for = { $$scope: 1 };
      let i = levels.length;
      while (i--) {
          const o = levels[i];
          const n = updates[i];
          if (n) {
              for (const key in o) {
                  if (!(key in n))
                      to_null_out[key] = 1;
              }
              for (const key in n) {
                  if (!accounted_for[key]) {
                      update[key] = n[key];
                      accounted_for[key] = 1;
                  }
              }
              levels[i] = n;
          }
          else {
              for (const key in o) {
                  accounted_for[key] = 1;
              }
          }
      }
      for (const key in to_null_out) {
          if (!(key in update))
              update[key] = undefined;
      }
      return update;
  }
  function get_spread_object(spread_props) {
      return typeof spread_props === 'object' && spread_props !== null ? spread_props : {};
  }

  function bind(component, name, callback) {
      const index = component.$$.props[name];
      if (index !== undefined) {
          component.$$.bound[index] = callback;
          callback(component.$$.ctx[index]);
      }
  }
  function create_component(block) {
      block && block.c();
  }
  function mount_component(component, target, anchor) {
      const { fragment, on_mount, on_destroy, after_update } = component.$$;
      fragment && fragment.m(target, anchor);
      // onMount happens before the initial afterUpdate
      add_render_callback(() => {
          const new_on_destroy = on_mount.map(run).filter(is_function);
          if (on_destroy) {
              on_destroy.push(...new_on_destroy);
          }
          else {
              // Edge case - component was destroyed immediately,
              // most likely as a result of a binding initialising
              run_all(new_on_destroy);
          }
          component.$$.on_mount = [];
      });
      after_update.forEach(add_render_callback);
  }
  function destroy_component(component, detaching) {
      const $$ = component.$$;
      if ($$.fragment !== null) {
          run_all($$.on_destroy);
          $$.fragment && $$.fragment.d(detaching);
          // TODO null out other refs, including component.$$ (but need to
          // preserve final state?)
          $$.on_destroy = $$.fragment = null;
          $$.ctx = [];
      }
  }
  function make_dirty(component, i) {
      if (component.$$.dirty[0] === -1) {
          dirty_components.push(component);
          schedule_update();
          component.$$.dirty.fill(0);
      }
      component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
  }
  function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
      const parent_component = current_component;
      set_current_component(component);
      const prop_values = options.props || {};
      const $$ = component.$$ = {
          fragment: null,
          ctx: null,
          // state
          props,
          update: noop,
          not_equal,
          bound: blank_object(),
          // lifecycle
          on_mount: [],
          on_destroy: [],
          before_update: [],
          after_update: [],
          context: new Map(parent_component ? parent_component.$$.context : []),
          // everything else
          callbacks: blank_object(),
          dirty
      };
      let ready = false;
      $$.ctx = instance
          ? instance(component, prop_values, (i, ret, ...rest) => {
              const value = rest.length ? rest[0] : ret;
              if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                  if ($$.bound[i])
                      $$.bound[i](value);
                  if (ready)
                      make_dirty(component, i);
              }
              return ret;
          })
          : [];
      $$.update();
      ready = true;
      run_all($$.before_update);
      // `false` as a special case of no DOM component
      $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
      if (options.target) {
          if (options.hydrate) {
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              $$.fragment && $$.fragment.l(children(options.target));
          }
          else {
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              $$.fragment && $$.fragment.c();
          }
          if (options.intro)
              transition_in(component.$$.fragment);
          mount_component(component, options.target, options.anchor);
          flush();
      }
      set_current_component(parent_component);
  }
  class SvelteComponent {
      $destroy() {
          destroy_component(this, 1);
          this.$destroy = noop;
      }
      $on(type, callback) {
          const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
          callbacks.push(callback);
          return () => {
              const index = callbacks.indexOf(callback);
              if (index !== -1)
                  callbacks.splice(index, 1);
          };
      }
      $set() {
          // overridden by instance, if it has props
      }
  }

  const subscriber_queue = [];
  /**
   * Creates a `Readable` store that allows reading by subscription.
   * @param value initial value
   * @param {StartStopNotifier}start start and stop notifications for subscriptions
   */
  function readable(value, start) {
      return {
          subscribe: writable(value, start).subscribe,
      };
  }
  /**
   * Create a `Writable` store that allows both updating and reading by subscription.
   * @param {*=}value initial value
   * @param {StartStopNotifier=}start start and stop notifications for subscriptions
   */
  function writable(value, start = noop) {
      let stop;
      const subscribers = [];
      function set(new_value) {
          if (safe_not_equal(value, new_value)) {
              value = new_value;
              if (stop) { // store is ready
                  const run_queue = !subscriber_queue.length;
                  for (let i = 0; i < subscribers.length; i += 1) {
                      const s = subscribers[i];
                      s[1]();
                      subscriber_queue.push(s, value);
                  }
                  if (run_queue) {
                      for (let i = 0; i < subscriber_queue.length; i += 2) {
                          subscriber_queue[i][0](subscriber_queue[i + 1]);
                      }
                      subscriber_queue.length = 0;
                  }
              }
          }
      }
      function update(fn) {
          set(fn(value));
      }
      function subscribe(run, invalidate = noop) {
          const subscriber = [run, invalidate];
          subscribers.push(subscriber);
          if (subscribers.length === 1) {
              stop = start(set) || noop;
          }
          run(value);
          return () => {
              const index = subscribers.indexOf(subscriber);
              if (index !== -1) {
                  subscribers.splice(index, 1);
              }
              if (subscribers.length === 0) {
                  stop();
                  stop = null;
              }
          };
      }
      return { set, update, subscribe };
  }
  function derived(stores, fn, initial_value) {
      const single = !Array.isArray(stores);
      const stores_array = single
          ? [stores]
          : stores;
      const auto = fn.length < 2;
      return readable(initial_value, (set) => {
          let inited = false;
          const values = [];
          let pending = 0;
          let cleanup = noop;
          const sync = () => {
              if (pending) {
                  return;
              }
              cleanup();
              const result = fn(single ? values[0] : values, set);
              if (auto) {
                  set(result);
              }
              else {
                  cleanup = is_function(result) ? result : noop;
              }
          };
          const unsubscribers = stores_array.map((store, i) => subscribe(store, (value) => {
              values[i] = value;
              pending &= ~(1 << i);
              if (inited) {
                  sync();
              }
          }, () => {
              pending |= (1 << i);
          }));
          inited = true;
          sync();
          return function stop() {
              run_all(unsubscribers);
              cleanup();
          };
      });
  }

  function regexparam (str, loose) {
  	if (str instanceof RegExp) return { keys:false, pattern:str };
  	var c, o, tmp, ext, keys=[], pattern='', arr = str.split('/');
  	arr[0] || arr.shift();

  	while (tmp = arr.shift()) {
  		c = tmp[0];
  		if (c === '*') {
  			keys.push('wild');
  			pattern += '/(.*)';
  		} else if (c === ':') {
  			o = tmp.indexOf('?', 1);
  			ext = tmp.indexOf('.', 1);
  			keys.push( tmp.substring(1, !!~o ? o : !!~ext ? ext : tmp.length) );
  			pattern += !!~o && !~ext ? '(?:/([^/]+?))?' : '/([^/]+?)';
  			if (!!~ext) pattern += (!!~o ? '?' : '') + '\\' + tmp.substring(ext);
  		} else {
  			pattern += '/' + tmp;
  		}
  	}

  	return {
  		keys: keys,
  		pattern: new RegExp('^' + pattern + (loose ? '(?=$|\/)' : '\/?$'), 'i')
  	};
  }

  /* node_modules/svelte-spa-router/Router.svelte generated by Svelte v3.18.1 */

  function create_fragment(ctx) {
  	let switch_instance_anchor;
  	let current;
  	var switch_value = /*component*/ ctx[0];

  	function switch_props(ctx) {
  		return {
  			props: { params: /*componentParams*/ ctx[1] }
  		};
  	}

  	if (switch_value) {
  		var switch_instance = new switch_value(switch_props(ctx));
  	}

  	return {
  		c() {
  			if (switch_instance) create_component(switch_instance.$$.fragment);
  			switch_instance_anchor = empty();
  		},
  		m(target, anchor) {
  			if (switch_instance) {
  				mount_component(switch_instance, target, anchor);
  			}

  			insert(target, switch_instance_anchor, anchor);
  			current = true;
  		},
  		p(ctx, [dirty]) {
  			const switch_instance_changes = {};
  			if (dirty & /*componentParams*/ 2) switch_instance_changes.params = /*componentParams*/ ctx[1];

  			if (switch_value !== (switch_value = /*component*/ ctx[0])) {
  				if (switch_instance) {
  					group_outros();
  					const old_component = switch_instance;

  					transition_out(old_component.$$.fragment, 1, 0, () => {
  						destroy_component(old_component, 1);
  					});

  					check_outros();
  				}

  				if (switch_value) {
  					switch_instance = new switch_value(switch_props(ctx));
  					create_component(switch_instance.$$.fragment);
  					transition_in(switch_instance.$$.fragment, 1);
  					mount_component(switch_instance, switch_instance_anchor.parentNode, switch_instance_anchor);
  				} else {
  					switch_instance = null;
  				}
  			} else if (switch_value) {
  				switch_instance.$set(switch_instance_changes);
  			}
  		},
  		i(local) {
  			if (current) return;
  			if (switch_instance) transition_in(switch_instance.$$.fragment, local);
  			current = true;
  		},
  		o(local) {
  			if (switch_instance) transition_out(switch_instance.$$.fragment, local);
  			current = false;
  		},
  		d(detaching) {
  			if (detaching) detach(switch_instance_anchor);
  			if (switch_instance) destroy_component(switch_instance, detaching);
  		}
  	};
  }

  /**
   * @typedef {Object} Location
   * @property {string} location - Location (page/view), for example `/book`
   * @property {string} [querystring] - Querystring from the hash, as a string not parsed
   */
  /**
   * Returns the current location from the hash.
   *
   * @returns {Location} Location object
   * @private
   */
  function getLocation() {
  	const hashPosition = window.location.href.indexOf("#/");

  	let location = hashPosition > -1
  	? window.location.href.substr(hashPosition + 1)
  	: "/";

  	// Check if there's a querystring
  	const qsPosition = location.indexOf("?");

  	let querystring = "";

  	if (qsPosition > -1) {
  		querystring = location.substr(qsPosition + 1);
  		location = location.substr(0, qsPosition);
  	}

  	return { location, querystring };
  }

  const loc = readable(getLocation(), // eslint-disable-next-line prefer-arrow-callback
  function start(set) {
  	const update = () => {
  		set(getLocation());
  	};

  	window.addEventListener("hashchange", update, false);

  	return function stop() {
  		window.removeEventListener("hashchange", update, false);
  	};
  });

  const location = derived(loc, $loc => $loc.location);
  const querystring = derived(loc, $loc => $loc.querystring);

  function push(location) {
  	if (!location || location.length < 1 || location.charAt(0) != "/" && location.indexOf("#/") !== 0) {
  		throw Error("Invalid parameter location");
  	}

  	// Execute this code when the current call stack is complete
  	setTimeout(
  		() => {
  			window.location.hash = (location.charAt(0) == "#" ? "" : "#") + location;
  		},
  		0
  	);
  }

  function replace(location) {
  	if (!location || location.length < 1 || location.charAt(0) != "/" && location.indexOf("#/") !== 0) {
  		throw Error("Invalid parameter location");
  	}

  	// Execute this code when the current call stack is complete
  	setTimeout(
  		() => {
  			const dest = (location.charAt(0) == "#" ? "" : "#") + location;
  			history.replaceState(undefined, undefined, dest);

  			// The method above doesn't trigger the hashchange event, so let's do that manually
  			window.dispatchEvent(new Event("hashchange"));
  		},
  		0
  	);
  }

  function link(node) {
  	// Only apply to <a> tags
  	if (!node || !node.tagName || node.tagName.toLowerCase() != "a") {
  		throw Error("Action \"link\" can only be used with <a> tags");
  	}

  	// Destination must start with '/'
  	const href = node.getAttribute("href");

  	if (!href || href.length < 1 || href.charAt(0) != "/") {
  		throw Error("Invalid value for \"href\" attribute");
  	}

  	// Add # to every href attribute
  	node.setAttribute("href", "#" + href);
  }

  function instance($$self, $$props, $$invalidate) {
  	let $loc,
  		$$unsubscribe_loc = noop;

  	component_subscribe($$self, loc, $$value => $$invalidate(4, $loc = $$value));
  	$$self.$$.on_destroy.push(() => $$unsubscribe_loc());
  	let { routes = {} } = $$props;
  	let { prefix = "" } = $$props;

  	/**
   * Container for a route: path, component
   */
  	class RouteItem {
  		/**
   * Initializes the object and creates a regular expression from the path, using regexparam.
   *
   * @param {string} path - Path to the route (must start with '/' or '*')
   * @param {SvelteComponent} component - Svelte component for the route
   */
  		constructor(path, component) {
  			if (!component || typeof component != "function" && (typeof component != "object" || component._sveltesparouter !== true)) {
  				throw Error("Invalid component object");
  			}

  			// Path must be a regular or expression, or a string starting with '/' or '*'
  			if (!path || typeof path == "string" && (path.length < 1 || path.charAt(0) != "/" && path.charAt(0) != "*") || typeof path == "object" && !(path instanceof RegExp)) {
  				throw Error("Invalid value for \"path\" argument");
  			}

  			const { pattern, keys } = regexparam(path);
  			this.path = path;

  			// Check if the component is wrapped and we have conditions
  			if (typeof component == "object" && component._sveltesparouter === true) {
  				this.component = component.route;
  				this.conditions = component.conditions || [];
  				this.userData = component.userData;
  			} else {
  				this.component = component;
  				this.conditions = [];
  				this.userData = undefined;
  			}

  			this._pattern = pattern;
  			this._keys = keys;
  		}

  		/**
   * Checks if `path` matches the current route.
   * If there's a match, will return the list of parameters from the URL (if any).
   * In case of no match, the method will return `null`.
   *
   * @param {string} path - Path to test
   * @returns {null|Object.<string, string>} List of paramters from the URL if there's a match, or `null` otherwise.
   */
  		match(path) {
  			// If there's a prefix, remove it before we run the matching
  			if (prefix && path.startsWith(prefix)) {
  				path = path.substr(prefix.length) || "/";
  			}

  			// Check if the pattern matches
  			const matches = this._pattern.exec(path);

  			if (matches === null) {
  				return null;
  			}

  			// If the input was a regular expression, this._keys would be false, so return matches as is
  			if (this._keys === false) {
  				return matches;
  			}

  			const out = {};
  			let i = 0;

  			while (i < this._keys.length) {
  				out[this._keys[i]] = matches[++i] || null;
  			}

  			return out;
  		}

  		/**
   * Dictionary with route details passed to the pre-conditions functions, as well as the `routeLoaded` and `conditionsFailed` events
   * @typedef {Object} RouteDetail
   * @property {SvelteComponent} component - Svelte component
   * @property {string} name - Name of the Svelte component
   * @property {string} location - Location path
   * @property {string} querystring - Querystring from the hash
   * @property {Object} [userData] - Custom data passed by the user
   */
  		/**
   * Executes all conditions (if any) to control whether the route can be shown. Conditions are executed in the order they are defined, and if a condition fails, the following ones aren't executed.
   * 
   * @param {RouteDetail} detail - Route detail
   * @returns {bool} Returns true if all the conditions succeeded
   */
  		checkConditions(detail) {
  			for (let i = 0; i < this.conditions.length; i++) {
  				if (!this.conditions[i](detail)) {
  					return false;
  				}
  			}

  			return true;
  		}
  	}

  	// We need an iterable: if it's not a Map, use Object.entries
  	const routesIterable = routes instanceof Map ? routes : Object.entries(routes);

  	// Set up all routes
  	const routesList = [];

  	for (const [path, route] of routesIterable) {
  		routesList.push(new RouteItem(path, route));
  	}

  	// Props for the component to render
  	let component = null;

  	let componentParams = {};

  	// Event dispatcher from Svelte
  	const dispatch = createEventDispatcher();

  	// Just like dispatch, but executes on the next iteration of the event loop
  	const dispatchNextTick = (name, detail) => {
  		// Execute this code when the current call stack is complete
  		setTimeout(
  			() => {
  				dispatch(name, detail);
  			},
  			0
  		);
  	};

  	$$self.$set = $$props => {
  		if ("routes" in $$props) $$invalidate(2, routes = $$props.routes);
  		if ("prefix" in $$props) $$invalidate(3, prefix = $$props.prefix);
  	};

  	$$self.$$.update = () => {
  		if ($$self.$$.dirty & /*component, $loc*/ 17) {
  			// Handle hash change events
  			// Listen to changes in the $loc store and update the page
  			 {
  				// Find a route matching the location
  				$$invalidate(0, component = null);

  				let i = 0;

  				while (!component && i < routesList.length) {
  					const match = routesList[i].match($loc.location);

  					if (match) {
  						const detail = {
  							component: routesList[i].component,
  							name: routesList[i].component.name,
  							location: $loc.location,
  							querystring: $loc.querystring,
  							userData: routesList[i].userData
  						};

  						// Check if the route can be loaded - if all conditions succeed
  						if (!routesList[i].checkConditions(detail)) {
  							// Trigger an event to notify the user
  							dispatchNextTick("conditionsFailed", detail);

  							break;
  						}

  						$$invalidate(0, component = routesList[i].component);
  						$$invalidate(1, componentParams = match);
  						dispatchNextTick("routeLoaded", detail);
  					}

  					i++;
  				}
  			}
  		}
  	};

  	return [component, componentParams, routes, prefix];
  }

  class Router extends SvelteComponent {
  	constructor(options) {
  		super();
  		init(this, options, instance, create_fragment, safe_not_equal, { routes: 2, prefix: 3 });
  	}
  }

  function forwardEventsBuilder(component, additionalEvents = []) {
    const events = [
      'focus', 'blur',
      'fullscreenchange', 'fullscreenerror', 'scroll',
      'cut', 'copy', 'paste',
      'keydown', 'keypress', 'keyup',
      'auxclick', 'click', 'contextmenu', 'dblclick', 'mousedown', 'mouseenter', 'mouseleave', 'mousemove', 'mouseover', 'mouseout', 'mouseup', 'pointerlockchange', 'pointerlockerror', 'select', 'wheel',
      'drag', 'dragend', 'dragenter', 'dragstart', 'dragleave', 'dragover', 'drop',
      'touchcancel', 'touchend', 'touchmove', 'touchstart',
      'pointerover', 'pointerenter', 'pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'pointerout', 'pointerleave', 'gotpointercapture', 'lostpointercapture',
      ...additionalEvents
    ];

    function forward(e) {
      bubble(component, e);
    }

    return node => {
      const destructors = [];

      for (let i = 0; i < events.length; i++) {
        destructors.push(listen(node, events[i], forward));
      }

      return {
        destroy: () => {
          for (let i = 0; i < destructors.length; i++) {
            destructors[i]();
          }
        }
      }
    };
  }

  function exclude(obj, keys) {
    let names = Object.getOwnPropertyNames(obj);
    const newObj = {};

    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      const cashIndex = name.indexOf('$');
      if (cashIndex !== -1 && keys.indexOf(name.substring(0, cashIndex + 1)) !== -1) {
        continue;
      }
      if (keys.indexOf(name) !== -1) {
        continue;
      }
      newObj[name] = obj[name];
    }

    return newObj;
  }

  function useActions(node, actions) {
    let objects = [];

    if (actions) {
      for (let i = 0; i < actions.length; i++) {
        const isArray = Array.isArray(actions[i]);
        const action = isArray ? actions[i][0] : actions[i];
        if (isArray && actions[i].length > 1) {
          objects.push(action(node, actions[i][1]));
        } else {
          objects.push(action(node));
        }
      }
    }

    return {
      update(actions) {
        if ((actions && actions.length || 0) != objects.length) {
          throw new Error('You must not change the length of an actions array.');
        }

        if (actions) {
          for (let i = 0; i < actions.length; i++) {
            if (objects[i] && 'update' in objects[i]) {
              const isArray = Array.isArray(actions[i]);
              if (isArray && actions[i].length > 1) {
                objects[i].update(actions[i][1]);
              } else {
                objects[i].update();
              }
            }
          }
        }
      },

      destroy() {
        for (let i = 0; i < objects.length; i++) {
          if (objects[i] && 'destroy' in objects[i]) {
            objects[i].destroy();
          }
        }
      }
    }
  }

  /* node_modules/@smui/common/A.svelte generated by Svelte v3.18.1 */

  function create_fragment$1(ctx) {
  	let a;
  	let useActions_action;
  	let forwardEvents_action;
  	let current;
  	let dispose;
  	const default_slot_template = /*$$slots*/ ctx[5].default;
  	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[4], null);
  	let a_levels = [{ href: /*href*/ ctx[1] }, exclude(/*$$props*/ ctx[3], ["use", "href"])];
  	let a_data = {};

  	for (let i = 0; i < a_levels.length; i += 1) {
  		a_data = assign(a_data, a_levels[i]);
  	}

  	return {
  		c() {
  			a = element("a");
  			if (default_slot) default_slot.c();
  			set_attributes(a, a_data);
  		},
  		m(target, anchor) {
  			insert(target, a, anchor);

  			if (default_slot) {
  				default_slot.m(a, null);
  			}

  			current = true;

  			dispose = [
  				action_destroyer(useActions_action = useActions.call(null, a, /*use*/ ctx[0])),
  				action_destroyer(forwardEvents_action = /*forwardEvents*/ ctx[2].call(null, a))
  			];
  		},
  		p(ctx, [dirty]) {
  			if (default_slot && default_slot.p && dirty & /*$$scope*/ 16) {
  				default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[4], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[4], dirty, null));
  			}

  			set_attributes(a, get_spread_update(a_levels, [
  				dirty & /*href*/ 2 && { href: /*href*/ ctx[1] },
  				dirty & /*exclude, $$props*/ 8 && exclude(/*$$props*/ ctx[3], ["use", "href"])
  			]));

  			if (useActions_action && is_function(useActions_action.update) && dirty & /*use*/ 1) useActions_action.update.call(null, /*use*/ ctx[0]);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(default_slot, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(default_slot, local);
  			current = false;
  		},
  		d(detaching) {
  			if (detaching) detach(a);
  			if (default_slot) default_slot.d(detaching);
  			run_all(dispose);
  		}
  	};
  }

  function instance$1($$self, $$props, $$invalidate) {
  	const forwardEvents = forwardEventsBuilder(current_component);
  	let { use = [] } = $$props;
  	let { href = "javascript:void(0);" } = $$props;
  	let { $$slots = {}, $$scope } = $$props;

  	$$self.$set = $$new_props => {
  		$$invalidate(3, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
  		if ("use" in $$new_props) $$invalidate(0, use = $$new_props.use);
  		if ("href" in $$new_props) $$invalidate(1, href = $$new_props.href);
  		if ("$$scope" in $$new_props) $$invalidate(4, $$scope = $$new_props.$$scope);
  	};

  	$$props = exclude_internal_props($$props);
  	return [use, href, forwardEvents, $$props, $$scope, $$slots];
  }

  class A extends SvelteComponent {
  	constructor(options) {
  		super();
  		init(this, options, instance$1, create_fragment$1, safe_not_equal, { use: 0, href: 1 });
  	}
  }

  /*! *****************************************************************************
  Copyright (c) Microsoft Corporation. All rights reserved.
  Licensed under the Apache License, Version 2.0 (the "License"); you may not use
  this file except in compliance with the License. You may obtain a copy of the
  License at http://www.apache.org/licenses/LICENSE-2.0

  THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
  KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
  WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
  MERCHANTABLITY OR NON-INFRINGEMENT.

  See the Apache Version 2.0 License for specific language governing permissions
  and limitations under the License.
  ***************************************************************************** */
  /* global Reflect, Promise */

  var extendStatics = function(d, b) {
      extendStatics = Object.setPrototypeOf ||
          ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
          function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
      return extendStatics(d, b);
  };

  function __extends(d, b) {
      extendStatics(d, b);
      function __() { this.constructor = d; }
      d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
  }

  var __assign = function() {
      __assign = Object.assign || function __assign(t) {
          for (var s, i = 1, n = arguments.length; i < n; i++) {
              s = arguments[i];
              for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
          }
          return t;
      };
      return __assign.apply(this, arguments);
  };

  function __read(o, n) {
      var m = typeof Symbol === "function" && o[Symbol.iterator];
      if (!m) return o;
      var i = m.call(o), r, ar = [], e;
      try {
          while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
      }
      catch (error) { e = { error: error }; }
      finally {
          try {
              if (r && !r.done && (m = i["return"])) m.call(i);
          }
          finally { if (e) throw e.error; }
      }
      return ar;
  }

  function __spread() {
      for (var ar = [], i = 0; i < arguments.length; i++)
          ar = ar.concat(__read(arguments[i]));
      return ar;
  }

  /**
   * @license
   * Copyright 2016 Google Inc.
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in
   * all copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
   * THE SOFTWARE.
   */
  var MDCFoundation = /** @class */ (function () {
      function MDCFoundation(adapter) {
          if (adapter === void 0) { adapter = {}; }
          this.adapter_ = adapter;
      }
      Object.defineProperty(MDCFoundation, "cssClasses", {
          get: function () {
              // Classes extending MDCFoundation should implement this method to return an object which exports every
              // CSS class the foundation class needs as a property. e.g. {ACTIVE: 'mdc-component--active'}
              return {};
          },
          enumerable: true,
          configurable: true
      });
      Object.defineProperty(MDCFoundation, "strings", {
          get: function () {
              // Classes extending MDCFoundation should implement this method to return an object which exports all
              // semantic strings as constants. e.g. {ARIA_ROLE: 'tablist'}
              return {};
          },
          enumerable: true,
          configurable: true
      });
      Object.defineProperty(MDCFoundation, "numbers", {
          get: function () {
              // Classes extending MDCFoundation should implement this method to return an object which exports all
              // of its semantic numbers as constants. e.g. {ANIMATION_DELAY_MS: 350}
              return {};
          },
          enumerable: true,
          configurable: true
      });
      Object.defineProperty(MDCFoundation, "defaultAdapter", {
          get: function () {
              // Classes extending MDCFoundation may choose to implement this getter in order to provide a convenient
              // way of viewing the necessary methods of an adapter. In the future, this could also be used for adapter
              // validation.
              return {};
          },
          enumerable: true,
          configurable: true
      });
      MDCFoundation.prototype.init = function () {
          // Subclasses should override this method to perform initialization routines (registering events, etc.)
      };
      MDCFoundation.prototype.destroy = function () {
          // Subclasses should override this method to perform de-initialization routines (de-registering events, etc.)
      };
      return MDCFoundation;
  }());
  //# sourceMappingURL=foundation.js.map

  /**
   * @license
   * Copyright 2016 Google Inc.
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in
   * all copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
   * THE SOFTWARE.
   */
  var MDCComponent = /** @class */ (function () {
      function MDCComponent(root, foundation) {
          var args = [];
          for (var _i = 2; _i < arguments.length; _i++) {
              args[_i - 2] = arguments[_i];
          }
          this.root_ = root;
          this.initialize.apply(this, __spread(args));
          // Note that we initialize foundation here and not within the constructor's default param so that
          // this.root_ is defined and can be used within the foundation class.
          this.foundation_ = foundation === undefined ? this.getDefaultFoundation() : foundation;
          this.foundation_.init();
          this.initialSyncWithDOM();
      }
      MDCComponent.attachTo = function (root) {
          // Subclasses which extend MDCBase should provide an attachTo() method that takes a root element and
          // returns an instantiated component with its root set to that element. Also note that in the cases of
          // subclasses, an explicit foundation class will not have to be passed in; it will simply be initialized
          // from getDefaultFoundation().
          return new MDCComponent(root, new MDCFoundation({}));
      };
      /* istanbul ignore next: method param only exists for typing purposes; it does not need to be unit tested */
      MDCComponent.prototype.initialize = function () {
          var _args = [];
          for (var _i = 0; _i < arguments.length; _i++) {
              _args[_i] = arguments[_i];
          }
          // Subclasses can override this to do any additional setup work that would be considered part of a
          // "constructor". Essentially, it is a hook into the parent constructor before the foundation is
          // initialized. Any additional arguments besides root and foundation will be passed in here.
      };
      MDCComponent.prototype.getDefaultFoundation = function () {
          // Subclasses must override this method to return a properly configured foundation class for the
          // component.
          throw new Error('Subclasses must override getDefaultFoundation to return a properly configured ' +
              'foundation class');
      };
      MDCComponent.prototype.initialSyncWithDOM = function () {
          // Subclasses should override this method if they need to perform work to synchronize with a host DOM
          // object. An example of this would be a form control wrapper that needs to synchronize its internal state
          // to some property or attribute of the host DOM. Please note: this is *not* the place to perform DOM
          // reads/writes that would cause layout / paint, as this is called synchronously from within the constructor.
      };
      MDCComponent.prototype.destroy = function () {
          // Subclasses may implement this method to release any resources / deregister any listeners they have
          // attached. An example of this might be deregistering a resize event from the window object.
          this.foundation_.destroy();
      };
      MDCComponent.prototype.listen = function (evtType, handler, options) {
          this.root_.addEventListener(evtType, handler, options);
      };
      MDCComponent.prototype.unlisten = function (evtType, handler, options) {
          this.root_.removeEventListener(evtType, handler, options);
      };
      /**
       * Fires a cross-browser-compatible custom event from the component root of the given type, with the given data.
       */
      MDCComponent.prototype.emit = function (evtType, evtData, shouldBubble) {
          if (shouldBubble === void 0) { shouldBubble = false; }
          var evt;
          if (typeof CustomEvent === 'function') {
              evt = new CustomEvent(evtType, {
                  bubbles: shouldBubble,
                  detail: evtData,
              });
          }
          else {
              evt = document.createEvent('CustomEvent');
              evt.initCustomEvent(evtType, shouldBubble, false, evtData);
          }
          this.root_.dispatchEvent(evt);
      };
      return MDCComponent;
  }());
  //# sourceMappingURL=component.js.map

  /**
   * @license
   * Copyright 2019 Google Inc.
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in
   * all copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
   * THE SOFTWARE.
   */
  /**
   * Stores result from applyPassive to avoid redundant processing to detect
   * passive event listener support.
   */
  var supportsPassive_;
  /**
   * Determine whether the current browser supports passive event listeners, and
   * if so, use them.
   */
  function applyPassive(globalObj, forceRefresh) {
      if (globalObj === void 0) { globalObj = window; }
      if (forceRefresh === void 0) { forceRefresh = false; }
      if (supportsPassive_ === undefined || forceRefresh) {
          var isSupported_1 = false;
          try {
              globalObj.document.addEventListener('test', function () { return undefined; }, {
                  get passive() {
                      isSupported_1 = true;
                      return isSupported_1;
                  },
              });
          }
          catch (e) {
          } // tslint:disable-line:no-empty cannot throw error due to tests. tslint also disables console.log.
          supportsPassive_ = isSupported_1;
      }
      return supportsPassive_ ? { passive: true } : false;
  }
  //# sourceMappingURL=events.js.map

  /**
   * @license
   * Copyright 2018 Google Inc.
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in
   * all copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
   * THE SOFTWARE.
   */
  /**
   * @fileoverview A "ponyfill" is a polyfill that doesn't modify the global prototype chain.
   * This makes ponyfills safer than traditional polyfills, especially for libraries like MDC.
   */
  function closest(element, selector) {
      if (element.closest) {
          return element.closest(selector);
      }
      var el = element;
      while (el) {
          if (matches(el, selector)) {
              return el;
          }
          el = el.parentElement;
      }
      return null;
  }
  function matches(element, selector) {
      var nativeMatches = element.matches
          || element.webkitMatchesSelector
          || element.msMatchesSelector;
      return nativeMatches.call(element, selector);
  }
  //# sourceMappingURL=ponyfill.js.map

  /**
   * @license
   * Copyright 2016 Google Inc.
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in
   * all copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
   * THE SOFTWARE.
   */
  var cssClasses = {
      // Ripple is a special case where the "root" component is really a "mixin" of sorts,
      // given that it's an 'upgrade' to an existing component. That being said it is the root
      // CSS class that all other CSS classes derive from.
      BG_FOCUSED: 'mdc-ripple-upgraded--background-focused',
      FG_ACTIVATION: 'mdc-ripple-upgraded--foreground-activation',
      FG_DEACTIVATION: 'mdc-ripple-upgraded--foreground-deactivation',
      ROOT: 'mdc-ripple-upgraded',
      UNBOUNDED: 'mdc-ripple-upgraded--unbounded',
  };
  var strings = {
      VAR_FG_SCALE: '--mdc-ripple-fg-scale',
      VAR_FG_SIZE: '--mdc-ripple-fg-size',
      VAR_FG_TRANSLATE_END: '--mdc-ripple-fg-translate-end',
      VAR_FG_TRANSLATE_START: '--mdc-ripple-fg-translate-start',
      VAR_LEFT: '--mdc-ripple-left',
      VAR_TOP: '--mdc-ripple-top',
  };
  var numbers = {
      DEACTIVATION_TIMEOUT_MS: 225,
      FG_DEACTIVATION_MS: 150,
      INITIAL_ORIGIN_SCALE: 0.6,
      PADDING: 10,
      TAP_DELAY_MS: 300,
  };
  //# sourceMappingURL=constants.js.map

  /**
   * Stores result from supportsCssVariables to avoid redundant processing to
   * detect CSS custom variable support.
   */
  var supportsCssVariables_;
  function detectEdgePseudoVarBug(windowObj) {
      // Detect versions of Edge with buggy var() support
      // See: https://developer.microsoft.com/en-us/microsoft-edge/platform/issues/11495448/
      var document = windowObj.document;
      var node = document.createElement('div');
      node.className = 'mdc-ripple-surface--test-edge-var-bug';
      // Append to head instead of body because this script might be invoked in the
      // head, in which case the body doesn't exist yet. The probe works either way.
      document.head.appendChild(node);
      // The bug exists if ::before style ends up propagating to the parent element.
      // Additionally, getComputedStyle returns null in iframes with display: "none" in Firefox,
      // but Firefox is known to support CSS custom properties correctly.
      // See: https://bugzilla.mozilla.org/show_bug.cgi?id=548397
      var computedStyle = windowObj.getComputedStyle(node);
      var hasPseudoVarBug = computedStyle !== null && computedStyle.borderTopStyle === 'solid';
      if (node.parentNode) {
          node.parentNode.removeChild(node);
      }
      return hasPseudoVarBug;
  }
  function supportsCssVariables(windowObj, forceRefresh) {
      if (forceRefresh === void 0) { forceRefresh = false; }
      var CSS = windowObj.CSS;
      var supportsCssVars = supportsCssVariables_;
      if (typeof supportsCssVariables_ === 'boolean' && !forceRefresh) {
          return supportsCssVariables_;
      }
      var supportsFunctionPresent = CSS && typeof CSS.supports === 'function';
      if (!supportsFunctionPresent) {
          return false;
      }
      var explicitlySupportsCssVars = CSS.supports('--css-vars', 'yes');
      // See: https://bugs.webkit.org/show_bug.cgi?id=154669
      // See: README section on Safari
      var weAreFeatureDetectingSafari10plus = (CSS.supports('(--css-vars: yes)') &&
          CSS.supports('color', '#00000000'));
      if (explicitlySupportsCssVars || weAreFeatureDetectingSafari10plus) {
          supportsCssVars = !detectEdgePseudoVarBug(windowObj);
      }
      else {
          supportsCssVars = false;
      }
      if (!forceRefresh) {
          supportsCssVariables_ = supportsCssVars;
      }
      return supportsCssVars;
  }
  function getNormalizedEventCoords(evt, pageOffset, clientRect) {
      if (!evt) {
          return { x: 0, y: 0 };
      }
      var x = pageOffset.x, y = pageOffset.y;
      var documentX = x + clientRect.left;
      var documentY = y + clientRect.top;
      var normalizedX;
      var normalizedY;
      // Determine touch point relative to the ripple container.
      if (evt.type === 'touchstart') {
          var touchEvent = evt;
          normalizedX = touchEvent.changedTouches[0].pageX - documentX;
          normalizedY = touchEvent.changedTouches[0].pageY - documentY;
      }
      else {
          var mouseEvent = evt;
          normalizedX = mouseEvent.pageX - documentX;
          normalizedY = mouseEvent.pageY - documentY;
      }
      return { x: normalizedX, y: normalizedY };
  }
  //# sourceMappingURL=util.js.map

  /**
   * @license
   * Copyright 2016 Google Inc.
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in
   * all copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
   * THE SOFTWARE.
   */
  // Activation events registered on the root element of each instance for activation
  var ACTIVATION_EVENT_TYPES = [
      'touchstart', 'pointerdown', 'mousedown', 'keydown',
  ];
  // Deactivation events registered on documentElement when a pointer-related down event occurs
  var POINTER_DEACTIVATION_EVENT_TYPES = [
      'touchend', 'pointerup', 'mouseup', 'contextmenu',
  ];
  // simultaneous nested activations
  var activatedTargets = [];
  var MDCRippleFoundation = /** @class */ (function (_super) {
      __extends(MDCRippleFoundation, _super);
      function MDCRippleFoundation(adapter) {
          var _this = _super.call(this, __assign({}, MDCRippleFoundation.defaultAdapter, adapter)) || this;
          _this.activationAnimationHasEnded_ = false;
          _this.activationTimer_ = 0;
          _this.fgDeactivationRemovalTimer_ = 0;
          _this.fgScale_ = '0';
          _this.frame_ = { width: 0, height: 0 };
          _this.initialSize_ = 0;
          _this.layoutFrame_ = 0;
          _this.maxRadius_ = 0;
          _this.unboundedCoords_ = { left: 0, top: 0 };
          _this.activationState_ = _this.defaultActivationState_();
          _this.activationTimerCallback_ = function () {
              _this.activationAnimationHasEnded_ = true;
              _this.runDeactivationUXLogicIfReady_();
          };
          _this.activateHandler_ = function (e) { return _this.activate_(e); };
          _this.deactivateHandler_ = function () { return _this.deactivate_(); };
          _this.focusHandler_ = function () { return _this.handleFocus(); };
          _this.blurHandler_ = function () { return _this.handleBlur(); };
          _this.resizeHandler_ = function () { return _this.layout(); };
          return _this;
      }
      Object.defineProperty(MDCRippleFoundation, "cssClasses", {
          get: function () {
              return cssClasses;
          },
          enumerable: true,
          configurable: true
      });
      Object.defineProperty(MDCRippleFoundation, "strings", {
          get: function () {
              return strings;
          },
          enumerable: true,
          configurable: true
      });
      Object.defineProperty(MDCRippleFoundation, "numbers", {
          get: function () {
              return numbers;
          },
          enumerable: true,
          configurable: true
      });
      Object.defineProperty(MDCRippleFoundation, "defaultAdapter", {
          get: function () {
              return {
                  addClass: function () { return undefined; },
                  browserSupportsCssVars: function () { return true; },
                  computeBoundingRect: function () { return ({ top: 0, right: 0, bottom: 0, left: 0, width: 0, height: 0 }); },
                  containsEventTarget: function () { return true; },
                  deregisterDocumentInteractionHandler: function () { return undefined; },
                  deregisterInteractionHandler: function () { return undefined; },
                  deregisterResizeHandler: function () { return undefined; },
                  getWindowPageOffset: function () { return ({ x: 0, y: 0 }); },
                  isSurfaceActive: function () { return true; },
                  isSurfaceDisabled: function () { return true; },
                  isUnbounded: function () { return true; },
                  registerDocumentInteractionHandler: function () { return undefined; },
                  registerInteractionHandler: function () { return undefined; },
                  registerResizeHandler: function () { return undefined; },
                  removeClass: function () { return undefined; },
                  updateCssVariable: function () { return undefined; },
              };
          },
          enumerable: true,
          configurable: true
      });
      MDCRippleFoundation.prototype.init = function () {
          var _this = this;
          var supportsPressRipple = this.supportsPressRipple_();
          this.registerRootHandlers_(supportsPressRipple);
          if (supportsPressRipple) {
              var _a = MDCRippleFoundation.cssClasses, ROOT_1 = _a.ROOT, UNBOUNDED_1 = _a.UNBOUNDED;
              requestAnimationFrame(function () {
                  _this.adapter_.addClass(ROOT_1);
                  if (_this.adapter_.isUnbounded()) {
                      _this.adapter_.addClass(UNBOUNDED_1);
                      // Unbounded ripples need layout logic applied immediately to set coordinates for both shade and ripple
                      _this.layoutInternal_();
                  }
              });
          }
      };
      MDCRippleFoundation.prototype.destroy = function () {
          var _this = this;
          if (this.supportsPressRipple_()) {
              if (this.activationTimer_) {
                  clearTimeout(this.activationTimer_);
                  this.activationTimer_ = 0;
                  this.adapter_.removeClass(MDCRippleFoundation.cssClasses.FG_ACTIVATION);
              }
              if (this.fgDeactivationRemovalTimer_) {
                  clearTimeout(this.fgDeactivationRemovalTimer_);
                  this.fgDeactivationRemovalTimer_ = 0;
                  this.adapter_.removeClass(MDCRippleFoundation.cssClasses.FG_DEACTIVATION);
              }
              var _a = MDCRippleFoundation.cssClasses, ROOT_2 = _a.ROOT, UNBOUNDED_2 = _a.UNBOUNDED;
              requestAnimationFrame(function () {
                  _this.adapter_.removeClass(ROOT_2);
                  _this.adapter_.removeClass(UNBOUNDED_2);
                  _this.removeCssVars_();
              });
          }
          this.deregisterRootHandlers_();
          this.deregisterDeactivationHandlers_();
      };
      /**
       * @param evt Optional event containing position information.
       */
      MDCRippleFoundation.prototype.activate = function (evt) {
          this.activate_(evt);
      };
      MDCRippleFoundation.prototype.deactivate = function () {
          this.deactivate_();
      };
      MDCRippleFoundation.prototype.layout = function () {
          var _this = this;
          if (this.layoutFrame_) {
              cancelAnimationFrame(this.layoutFrame_);
          }
          this.layoutFrame_ = requestAnimationFrame(function () {
              _this.layoutInternal_();
              _this.layoutFrame_ = 0;
          });
      };
      MDCRippleFoundation.prototype.setUnbounded = function (unbounded) {
          var UNBOUNDED = MDCRippleFoundation.cssClasses.UNBOUNDED;
          if (unbounded) {
              this.adapter_.addClass(UNBOUNDED);
          }
          else {
              this.adapter_.removeClass(UNBOUNDED);
          }
      };
      MDCRippleFoundation.prototype.handleFocus = function () {
          var _this = this;
          requestAnimationFrame(function () {
              return _this.adapter_.addClass(MDCRippleFoundation.cssClasses.BG_FOCUSED);
          });
      };
      MDCRippleFoundation.prototype.handleBlur = function () {
          var _this = this;
          requestAnimationFrame(function () {
              return _this.adapter_.removeClass(MDCRippleFoundation.cssClasses.BG_FOCUSED);
          });
      };
      /**
       * We compute this property so that we are not querying information about the client
       * until the point in time where the foundation requests it. This prevents scenarios where
       * client-side feature-detection may happen too early, such as when components are rendered on the server
       * and then initialized at mount time on the client.
       */
      MDCRippleFoundation.prototype.supportsPressRipple_ = function () {
          return this.adapter_.browserSupportsCssVars();
      };
      MDCRippleFoundation.prototype.defaultActivationState_ = function () {
          return {
              activationEvent: undefined,
              hasDeactivationUXRun: false,
              isActivated: false,
              isProgrammatic: false,
              wasActivatedByPointer: false,
              wasElementMadeActive: false,
          };
      };
      /**
       * supportsPressRipple Passed from init to save a redundant function call
       */
      MDCRippleFoundation.prototype.registerRootHandlers_ = function (supportsPressRipple) {
          var _this = this;
          if (supportsPressRipple) {
              ACTIVATION_EVENT_TYPES.forEach(function (evtType) {
                  _this.adapter_.registerInteractionHandler(evtType, _this.activateHandler_);
              });
              if (this.adapter_.isUnbounded()) {
                  this.adapter_.registerResizeHandler(this.resizeHandler_);
              }
          }
          this.adapter_.registerInteractionHandler('focus', this.focusHandler_);
          this.adapter_.registerInteractionHandler('blur', this.blurHandler_);
      };
      MDCRippleFoundation.prototype.registerDeactivationHandlers_ = function (evt) {
          var _this = this;
          if (evt.type === 'keydown') {
              this.adapter_.registerInteractionHandler('keyup', this.deactivateHandler_);
          }
          else {
              POINTER_DEACTIVATION_EVENT_TYPES.forEach(function (evtType) {
                  _this.adapter_.registerDocumentInteractionHandler(evtType, _this.deactivateHandler_);
              });
          }
      };
      MDCRippleFoundation.prototype.deregisterRootHandlers_ = function () {
          var _this = this;
          ACTIVATION_EVENT_TYPES.forEach(function (evtType) {
              _this.adapter_.deregisterInteractionHandler(evtType, _this.activateHandler_);
          });
          this.adapter_.deregisterInteractionHandler('focus', this.focusHandler_);
          this.adapter_.deregisterInteractionHandler('blur', this.blurHandler_);
          if (this.adapter_.isUnbounded()) {
              this.adapter_.deregisterResizeHandler(this.resizeHandler_);
          }
      };
      MDCRippleFoundation.prototype.deregisterDeactivationHandlers_ = function () {
          var _this = this;
          this.adapter_.deregisterInteractionHandler('keyup', this.deactivateHandler_);
          POINTER_DEACTIVATION_EVENT_TYPES.forEach(function (evtType) {
              _this.adapter_.deregisterDocumentInteractionHandler(evtType, _this.deactivateHandler_);
          });
      };
      MDCRippleFoundation.prototype.removeCssVars_ = function () {
          var _this = this;
          var rippleStrings = MDCRippleFoundation.strings;
          var keys = Object.keys(rippleStrings);
          keys.forEach(function (key) {
              if (key.indexOf('VAR_') === 0) {
                  _this.adapter_.updateCssVariable(rippleStrings[key], null);
              }
          });
      };
      MDCRippleFoundation.prototype.activate_ = function (evt) {
          var _this = this;
          if (this.adapter_.isSurfaceDisabled()) {
              return;
          }
          var activationState = this.activationState_;
          if (activationState.isActivated) {
              return;
          }
          // Avoid reacting to follow-on events fired by touch device after an already-processed user interaction
          var previousActivationEvent = this.previousActivationEvent_;
          var isSameInteraction = previousActivationEvent && evt !== undefined && previousActivationEvent.type !== evt.type;
          if (isSameInteraction) {
              return;
          }
          activationState.isActivated = true;
          activationState.isProgrammatic = evt === undefined;
          activationState.activationEvent = evt;
          activationState.wasActivatedByPointer = activationState.isProgrammatic ? false : evt !== undefined && (evt.type === 'mousedown' || evt.type === 'touchstart' || evt.type === 'pointerdown');
          var hasActivatedChild = evt !== undefined && activatedTargets.length > 0 && activatedTargets.some(function (target) { return _this.adapter_.containsEventTarget(target); });
          if (hasActivatedChild) {
              // Immediately reset activation state, while preserving logic that prevents touch follow-on events
              this.resetActivationState_();
              return;
          }
          if (evt !== undefined) {
              activatedTargets.push(evt.target);
              this.registerDeactivationHandlers_(evt);
          }
          activationState.wasElementMadeActive = this.checkElementMadeActive_(evt);
          if (activationState.wasElementMadeActive) {
              this.animateActivation_();
          }
          requestAnimationFrame(function () {
              // Reset array on next frame after the current event has had a chance to bubble to prevent ancestor ripples
              activatedTargets = [];
              if (!activationState.wasElementMadeActive
                  && evt !== undefined
                  && (evt.key === ' ' || evt.keyCode === 32)) {
                  // If space was pressed, try again within an rAF call to detect :active, because different UAs report
                  // active states inconsistently when they're called within event handling code:
                  // - https://bugs.chromium.org/p/chromium/issues/detail?id=635971
                  // - https://bugzilla.mozilla.org/show_bug.cgi?id=1293741
                  // We try first outside rAF to support Edge, which does not exhibit this problem, but will crash if a CSS
                  // variable is set within a rAF callback for a submit button interaction (#2241).
                  activationState.wasElementMadeActive = _this.checkElementMadeActive_(evt);
                  if (activationState.wasElementMadeActive) {
                      _this.animateActivation_();
                  }
              }
              if (!activationState.wasElementMadeActive) {
                  // Reset activation state immediately if element was not made active.
                  _this.activationState_ = _this.defaultActivationState_();
              }
          });
      };
      MDCRippleFoundation.prototype.checkElementMadeActive_ = function (evt) {
          return (evt !== undefined && evt.type === 'keydown') ? this.adapter_.isSurfaceActive() : true;
      };
      MDCRippleFoundation.prototype.animateActivation_ = function () {
          var _this = this;
          var _a = MDCRippleFoundation.strings, VAR_FG_TRANSLATE_START = _a.VAR_FG_TRANSLATE_START, VAR_FG_TRANSLATE_END = _a.VAR_FG_TRANSLATE_END;
          var _b = MDCRippleFoundation.cssClasses, FG_DEACTIVATION = _b.FG_DEACTIVATION, FG_ACTIVATION = _b.FG_ACTIVATION;
          var DEACTIVATION_TIMEOUT_MS = MDCRippleFoundation.numbers.DEACTIVATION_TIMEOUT_MS;
          this.layoutInternal_();
          var translateStart = '';
          var translateEnd = '';
          if (!this.adapter_.isUnbounded()) {
              var _c = this.getFgTranslationCoordinates_(), startPoint = _c.startPoint, endPoint = _c.endPoint;
              translateStart = startPoint.x + "px, " + startPoint.y + "px";
              translateEnd = endPoint.x + "px, " + endPoint.y + "px";
          }
          this.adapter_.updateCssVariable(VAR_FG_TRANSLATE_START, translateStart);
          this.adapter_.updateCssVariable(VAR_FG_TRANSLATE_END, translateEnd);
          // Cancel any ongoing activation/deactivation animations
          clearTimeout(this.activationTimer_);
          clearTimeout(this.fgDeactivationRemovalTimer_);
          this.rmBoundedActivationClasses_();
          this.adapter_.removeClass(FG_DEACTIVATION);
          // Force layout in order to re-trigger the animation.
          this.adapter_.computeBoundingRect();
          this.adapter_.addClass(FG_ACTIVATION);
          this.activationTimer_ = setTimeout(function () { return _this.activationTimerCallback_(); }, DEACTIVATION_TIMEOUT_MS);
      };
      MDCRippleFoundation.prototype.getFgTranslationCoordinates_ = function () {
          var _a = this.activationState_, activationEvent = _a.activationEvent, wasActivatedByPointer = _a.wasActivatedByPointer;
          var startPoint;
          if (wasActivatedByPointer) {
              startPoint = getNormalizedEventCoords(activationEvent, this.adapter_.getWindowPageOffset(), this.adapter_.computeBoundingRect());
          }
          else {
              startPoint = {
                  x: this.frame_.width / 2,
                  y: this.frame_.height / 2,
              };
          }
          // Center the element around the start point.
          startPoint = {
              x: startPoint.x - (this.initialSize_ / 2),
              y: startPoint.y - (this.initialSize_ / 2),
          };
          var endPoint = {
              x: (this.frame_.width / 2) - (this.initialSize_ / 2),
              y: (this.frame_.height / 2) - (this.initialSize_ / 2),
          };
          return { startPoint: startPoint, endPoint: endPoint };
      };
      MDCRippleFoundation.prototype.runDeactivationUXLogicIfReady_ = function () {
          var _this = this;
          // This method is called both when a pointing device is released, and when the activation animation ends.
          // The deactivation animation should only run after both of those occur.
          var FG_DEACTIVATION = MDCRippleFoundation.cssClasses.FG_DEACTIVATION;
          var _a = this.activationState_, hasDeactivationUXRun = _a.hasDeactivationUXRun, isActivated = _a.isActivated;
          var activationHasEnded = hasDeactivationUXRun || !isActivated;
          if (activationHasEnded && this.activationAnimationHasEnded_) {
              this.rmBoundedActivationClasses_();
              this.adapter_.addClass(FG_DEACTIVATION);
              this.fgDeactivationRemovalTimer_ = setTimeout(function () {
                  _this.adapter_.removeClass(FG_DEACTIVATION);
              }, numbers.FG_DEACTIVATION_MS);
          }
      };
      MDCRippleFoundation.prototype.rmBoundedActivationClasses_ = function () {
          var FG_ACTIVATION = MDCRippleFoundation.cssClasses.FG_ACTIVATION;
          this.adapter_.removeClass(FG_ACTIVATION);
          this.activationAnimationHasEnded_ = false;
          this.adapter_.computeBoundingRect();
      };
      MDCRippleFoundation.prototype.resetActivationState_ = function () {
          var _this = this;
          this.previousActivationEvent_ = this.activationState_.activationEvent;
          this.activationState_ = this.defaultActivationState_();
          // Touch devices may fire additional events for the same interaction within a short time.
          // Store the previous event until it's safe to assume that subsequent events are for new interactions.
          setTimeout(function () { return _this.previousActivationEvent_ = undefined; }, MDCRippleFoundation.numbers.TAP_DELAY_MS);
      };
      MDCRippleFoundation.prototype.deactivate_ = function () {
          var _this = this;
          var activationState = this.activationState_;
          // This can happen in scenarios such as when you have a keyup event that blurs the element.
          if (!activationState.isActivated) {
              return;
          }
          var state = __assign({}, activationState);
          if (activationState.isProgrammatic) {
              requestAnimationFrame(function () { return _this.animateDeactivation_(state); });
              this.resetActivationState_();
          }
          else {
              this.deregisterDeactivationHandlers_();
              requestAnimationFrame(function () {
                  _this.activationState_.hasDeactivationUXRun = true;
                  _this.animateDeactivation_(state);
                  _this.resetActivationState_();
              });
          }
      };
      MDCRippleFoundation.prototype.animateDeactivation_ = function (_a) {
          var wasActivatedByPointer = _a.wasActivatedByPointer, wasElementMadeActive = _a.wasElementMadeActive;
          if (wasActivatedByPointer || wasElementMadeActive) {
              this.runDeactivationUXLogicIfReady_();
          }
      };
      MDCRippleFoundation.prototype.layoutInternal_ = function () {
          var _this = this;
          this.frame_ = this.adapter_.computeBoundingRect();
          var maxDim = Math.max(this.frame_.height, this.frame_.width);
          // Surface diameter is treated differently for unbounded vs. bounded ripples.
          // Unbounded ripple diameter is calculated smaller since the surface is expected to already be padded appropriately
          // to extend the hitbox, and the ripple is expected to meet the edges of the padded hitbox (which is typically
          // square). Bounded ripples, on the other hand, are fully expected to expand beyond the surface's longest diameter
          // (calculated based on the diagonal plus a constant padding), and are clipped at the surface's border via
          // `overflow: hidden`.
          var getBoundedRadius = function () {
              var hypotenuse = Math.sqrt(Math.pow(_this.frame_.width, 2) + Math.pow(_this.frame_.height, 2));
              return hypotenuse + MDCRippleFoundation.numbers.PADDING;
          };
          this.maxRadius_ = this.adapter_.isUnbounded() ? maxDim : getBoundedRadius();
          // Ripple is sized as a fraction of the largest dimension of the surface, then scales up using a CSS scale transform
          this.initialSize_ = Math.floor(maxDim * MDCRippleFoundation.numbers.INITIAL_ORIGIN_SCALE);
          this.fgScale_ = "" + this.maxRadius_ / this.initialSize_;
          this.updateLayoutCssVars_();
      };
      MDCRippleFoundation.prototype.updateLayoutCssVars_ = function () {
          var _a = MDCRippleFoundation.strings, VAR_FG_SIZE = _a.VAR_FG_SIZE, VAR_LEFT = _a.VAR_LEFT, VAR_TOP = _a.VAR_TOP, VAR_FG_SCALE = _a.VAR_FG_SCALE;
          this.adapter_.updateCssVariable(VAR_FG_SIZE, this.initialSize_ + "px");
          this.adapter_.updateCssVariable(VAR_FG_SCALE, this.fgScale_);
          if (this.adapter_.isUnbounded()) {
              this.unboundedCoords_ = {
                  left: Math.round((this.frame_.width / 2) - (this.initialSize_ / 2)),
                  top: Math.round((this.frame_.height / 2) - (this.initialSize_ / 2)),
              };
              this.adapter_.updateCssVariable(VAR_LEFT, this.unboundedCoords_.left + "px");
              this.adapter_.updateCssVariable(VAR_TOP, this.unboundedCoords_.top + "px");
          }
      };
      return MDCRippleFoundation;
  }(MDCFoundation));
  //# sourceMappingURL=foundation.js.map

  /**
   * @license
   * Copyright 2016 Google Inc.
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in
   * all copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
   * THE SOFTWARE.
   */
  var MDCRipple = /** @class */ (function (_super) {
      __extends(MDCRipple, _super);
      function MDCRipple() {
          var _this = _super !== null && _super.apply(this, arguments) || this;
          _this.disabled = false;
          return _this;
      }
      MDCRipple.attachTo = function (root, opts) {
          if (opts === void 0) { opts = { isUnbounded: undefined }; }
          var ripple = new MDCRipple(root);
          // Only override unbounded behavior if option is explicitly specified
          if (opts.isUnbounded !== undefined) {
              ripple.unbounded = opts.isUnbounded;
          }
          return ripple;
      };
      MDCRipple.createAdapter = function (instance) {
          return {
              addClass: function (className) { return instance.root_.classList.add(className); },
              browserSupportsCssVars: function () { return supportsCssVariables(window); },
              computeBoundingRect: function () { return instance.root_.getBoundingClientRect(); },
              containsEventTarget: function (target) { return instance.root_.contains(target); },
              deregisterDocumentInteractionHandler: function (evtType, handler) {
                  return document.documentElement.removeEventListener(evtType, handler, applyPassive());
              },
              deregisterInteractionHandler: function (evtType, handler) {
                  return instance.root_.removeEventListener(evtType, handler, applyPassive());
              },
              deregisterResizeHandler: function (handler) { return window.removeEventListener('resize', handler); },
              getWindowPageOffset: function () { return ({ x: window.pageXOffset, y: window.pageYOffset }); },
              isSurfaceActive: function () { return matches(instance.root_, ':active'); },
              isSurfaceDisabled: function () { return Boolean(instance.disabled); },
              isUnbounded: function () { return Boolean(instance.unbounded); },
              registerDocumentInteractionHandler: function (evtType, handler) {
                  return document.documentElement.addEventListener(evtType, handler, applyPassive());
              },
              registerInteractionHandler: function (evtType, handler) {
                  return instance.root_.addEventListener(evtType, handler, applyPassive());
              },
              registerResizeHandler: function (handler) { return window.addEventListener('resize', handler); },
              removeClass: function (className) { return instance.root_.classList.remove(className); },
              updateCssVariable: function (varName, value) { return instance.root_.style.setProperty(varName, value); },
          };
      };
      Object.defineProperty(MDCRipple.prototype, "unbounded", {
          get: function () {
              return Boolean(this.unbounded_);
          },
          set: function (unbounded) {
              this.unbounded_ = Boolean(unbounded);
              this.setUnbounded_();
          },
          enumerable: true,
          configurable: true
      });
      MDCRipple.prototype.activate = function () {
          this.foundation_.activate();
      };
      MDCRipple.prototype.deactivate = function () {
          this.foundation_.deactivate();
      };
      MDCRipple.prototype.layout = function () {
          this.foundation_.layout();
      };
      MDCRipple.prototype.getDefaultFoundation = function () {
          return new MDCRippleFoundation(MDCRipple.createAdapter(this));
      };
      MDCRipple.prototype.initialSyncWithDOM = function () {
          var root = this.root_;
          this.unbounded = 'mdcRippleIsUnbounded' in root.dataset;
      };
      /**
       * Closure Compiler throws an access control error when directly accessing a
       * protected or private property inside a getter/setter, like unbounded above.
       * By accessing the protected property inside a method, we solve that problem.
       * That's why this function exists.
       */
      MDCRipple.prototype.setUnbounded_ = function () {
          this.foundation_.setUnbounded(Boolean(this.unbounded_));
      };
      return MDCRipple;
  }(MDCComponent));
  //# sourceMappingURL=component.js.map

  /**
   * @license
   * Copyright 2018 Google Inc.
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in
   * all copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
   * THE SOFTWARE.
   */
  var cssClasses$1 = {
      FIXED_CLASS: 'mdc-top-app-bar--fixed',
      FIXED_SCROLLED_CLASS: 'mdc-top-app-bar--fixed-scrolled',
      SHORT_CLASS: 'mdc-top-app-bar--short',
      SHORT_COLLAPSED_CLASS: 'mdc-top-app-bar--short-collapsed',
      SHORT_HAS_ACTION_ITEM_CLASS: 'mdc-top-app-bar--short-has-action-item',
  };
  var numbers$1 = {
      DEBOUNCE_THROTTLE_RESIZE_TIME_MS: 100,
      MAX_TOP_APP_BAR_HEIGHT: 128,
  };
  var strings$1 = {
      ACTION_ITEM_SELECTOR: '.mdc-top-app-bar__action-item',
      NAVIGATION_EVENT: 'MDCTopAppBar:nav',
      NAVIGATION_ICON_SELECTOR: '.mdc-top-app-bar__navigation-icon',
      ROOT_SELECTOR: '.mdc-top-app-bar',
      TITLE_SELECTOR: '.mdc-top-app-bar__title',
  };
  //# sourceMappingURL=constants.js.map

  /**
   * @license
   * Copyright 2018 Google Inc.
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in
   * all copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
   * THE SOFTWARE.
   */
  var MDCTopAppBarBaseFoundation = /** @class */ (function (_super) {
      __extends(MDCTopAppBarBaseFoundation, _super);
      /* istanbul ignore next: optional argument is not a branch statement */
      function MDCTopAppBarBaseFoundation(adapter) {
          return _super.call(this, __assign({}, MDCTopAppBarBaseFoundation.defaultAdapter, adapter)) || this;
      }
      Object.defineProperty(MDCTopAppBarBaseFoundation, "strings", {
          get: function () {
              return strings$1;
          },
          enumerable: true,
          configurable: true
      });
      Object.defineProperty(MDCTopAppBarBaseFoundation, "cssClasses", {
          get: function () {
              return cssClasses$1;
          },
          enumerable: true,
          configurable: true
      });
      Object.defineProperty(MDCTopAppBarBaseFoundation, "numbers", {
          get: function () {
              return numbers$1;
          },
          enumerable: true,
          configurable: true
      });
      Object.defineProperty(MDCTopAppBarBaseFoundation, "defaultAdapter", {
          /**
           * See {@link MDCTopAppBarAdapter} for typing information on parameters and return types.
           */
          get: function () {
              // tslint:disable:object-literal-sort-keys Methods should be in the same order as the adapter interface.
              return {
                  addClass: function () { return undefined; },
                  removeClass: function () { return undefined; },
                  hasClass: function () { return false; },
                  setStyle: function () { return undefined; },
                  getTopAppBarHeight: function () { return 0; },
                  notifyNavigationIconClicked: function () { return undefined; },
                  getViewportScrollY: function () { return 0; },
                  getTotalActionItems: function () { return 0; },
              };
              // tslint:enable:object-literal-sort-keys
          },
          enumerable: true,
          configurable: true
      });
      /** Other variants of TopAppBar foundation overrides this method */
      MDCTopAppBarBaseFoundation.prototype.handleTargetScroll = function () { }; // tslint:disable-line:no-empty
      /** Other variants of TopAppBar foundation overrides this method */
      MDCTopAppBarBaseFoundation.prototype.handleWindowResize = function () { }; // tslint:disable-line:no-empty
      MDCTopAppBarBaseFoundation.prototype.handleNavigationClick = function () {
          this.adapter_.notifyNavigationIconClicked();
      };
      return MDCTopAppBarBaseFoundation;
  }(MDCFoundation));
  //# sourceMappingURL=foundation.js.map

  /**
   * @license
   * Copyright 2018 Google Inc.
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in
   * all copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
   * THE SOFTWARE.
   */
  var INITIAL_VALUE = 0;
  var MDCTopAppBarFoundation = /** @class */ (function (_super) {
      __extends(MDCTopAppBarFoundation, _super);
      /* istanbul ignore next: optional argument is not a branch statement */
      function MDCTopAppBarFoundation(adapter) {
          var _this = _super.call(this, adapter) || this;
          /**
           * Indicates if the top app bar was docked in the previous scroll handler iteration.
           */
          _this.wasDocked_ = true;
          /**
           * Indicates if the top app bar is docked in the fully shown position.
           */
          _this.isDockedShowing_ = true;
          /**
           * Variable for current scroll position of the top app bar
           */
          _this.currentAppBarOffsetTop_ = 0;
          /**
           * Used to prevent the top app bar from being scrolled out of view during resize events
           */
          _this.isCurrentlyBeingResized_ = false;
          /**
           * The timeout that's used to throttle the resize events
           */
          _this.resizeThrottleId_ = INITIAL_VALUE;
          /**
           * The timeout that's used to debounce toggling the isCurrentlyBeingResized_ variable after a resize
           */
          _this.resizeDebounceId_ = INITIAL_VALUE;
          _this.lastScrollPosition_ = _this.adapter_.getViewportScrollY();
          _this.topAppBarHeight_ = _this.adapter_.getTopAppBarHeight();
          return _this;
      }
      MDCTopAppBarFoundation.prototype.destroy = function () {
          _super.prototype.destroy.call(this);
          this.adapter_.setStyle('top', '');
      };
      /**
       * Scroll handler for the default scroll behavior of the top app bar.
       * @override
       */
      MDCTopAppBarFoundation.prototype.handleTargetScroll = function () {
          var currentScrollPosition = Math.max(this.adapter_.getViewportScrollY(), 0);
          var diff = currentScrollPosition - this.lastScrollPosition_;
          this.lastScrollPosition_ = currentScrollPosition;
          // If the window is being resized the lastScrollPosition_ needs to be updated but the
          // current scroll of the top app bar should stay in the same position.
          if (!this.isCurrentlyBeingResized_) {
              this.currentAppBarOffsetTop_ -= diff;
              if (this.currentAppBarOffsetTop_ > 0) {
                  this.currentAppBarOffsetTop_ = 0;
              }
              else if (Math.abs(this.currentAppBarOffsetTop_) > this.topAppBarHeight_) {
                  this.currentAppBarOffsetTop_ = -this.topAppBarHeight_;
              }
              this.moveTopAppBar_();
          }
      };
      /**
       * Top app bar resize handler that throttle/debounce functions that execute updates.
       * @override
       */
      MDCTopAppBarFoundation.prototype.handleWindowResize = function () {
          var _this = this;
          // Throttle resize events 10 p/s
          if (!this.resizeThrottleId_) {
              this.resizeThrottleId_ = setTimeout(function () {
                  _this.resizeThrottleId_ = INITIAL_VALUE;
                  _this.throttledResizeHandler_();
              }, numbers$1.DEBOUNCE_THROTTLE_RESIZE_TIME_MS);
          }
          this.isCurrentlyBeingResized_ = true;
          if (this.resizeDebounceId_) {
              clearTimeout(this.resizeDebounceId_);
          }
          this.resizeDebounceId_ = setTimeout(function () {
              _this.handleTargetScroll();
              _this.isCurrentlyBeingResized_ = false;
              _this.resizeDebounceId_ = INITIAL_VALUE;
          }, numbers$1.DEBOUNCE_THROTTLE_RESIZE_TIME_MS);
      };
      /**
       * Function to determine if the DOM needs to update.
       */
      MDCTopAppBarFoundation.prototype.checkForUpdate_ = function () {
          var offscreenBoundaryTop = -this.topAppBarHeight_;
          var hasAnyPixelsOffscreen = this.currentAppBarOffsetTop_ < 0;
          var hasAnyPixelsOnscreen = this.currentAppBarOffsetTop_ > offscreenBoundaryTop;
          var partiallyShowing = hasAnyPixelsOffscreen && hasAnyPixelsOnscreen;
          // If it's partially showing, it can't be docked.
          if (partiallyShowing) {
              this.wasDocked_ = false;
          }
          else {
              // Not previously docked and not partially showing, it's now docked.
              if (!this.wasDocked_) {
                  this.wasDocked_ = true;
                  return true;
              }
              else if (this.isDockedShowing_ !== hasAnyPixelsOnscreen) {
                  this.isDockedShowing_ = hasAnyPixelsOnscreen;
                  return true;
              }
          }
          return partiallyShowing;
      };
      /**
       * Function to move the top app bar if needed.
       */
      MDCTopAppBarFoundation.prototype.moveTopAppBar_ = function () {
          if (this.checkForUpdate_()) {
              // Once the top app bar is fully hidden we use the max potential top app bar height as our offset
              // so the top app bar doesn't show if the window resizes and the new height > the old height.
              var offset = this.currentAppBarOffsetTop_;
              if (Math.abs(offset) >= this.topAppBarHeight_) {
                  offset = -numbers$1.MAX_TOP_APP_BAR_HEIGHT;
              }
              this.adapter_.setStyle('top', offset + 'px');
          }
      };
      /**
       * Throttled function that updates the top app bar scrolled values if the
       * top app bar height changes.
       */
      MDCTopAppBarFoundation.prototype.throttledResizeHandler_ = function () {
          var currentHeight = this.adapter_.getTopAppBarHeight();
          if (this.topAppBarHeight_ !== currentHeight) {
              this.wasDocked_ = false;
              // Since the top app bar has a different height depending on the screen width, this
              // will ensure that the top app bar remains in the correct location if
              // completely hidden and a resize makes the top app bar a different height.
              this.currentAppBarOffsetTop_ -= this.topAppBarHeight_ - currentHeight;
              this.topAppBarHeight_ = currentHeight;
          }
          this.handleTargetScroll();
      };
      return MDCTopAppBarFoundation;
  }(MDCTopAppBarBaseFoundation));
  //# sourceMappingURL=foundation.js.map

  /**
   * @license
   * Copyright 2018 Google Inc.
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in
   * all copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
   * THE SOFTWARE.
   */
  var MDCFixedTopAppBarFoundation = /** @class */ (function (_super) {
      __extends(MDCFixedTopAppBarFoundation, _super);
      function MDCFixedTopAppBarFoundation() {
          var _this = _super !== null && _super.apply(this, arguments) || this;
          /**
           * State variable for the previous scroll iteration top app bar state
           */
          _this.wasScrolled_ = false;
          return _this;
      }
      /**
       * Scroll handler for applying/removing the modifier class on the fixed top app bar.
       * @override
       */
      MDCFixedTopAppBarFoundation.prototype.handleTargetScroll = function () {
          var currentScroll = this.adapter_.getViewportScrollY();
          if (currentScroll <= 0) {
              if (this.wasScrolled_) {
                  this.adapter_.removeClass(cssClasses$1.FIXED_SCROLLED_CLASS);
                  this.wasScrolled_ = false;
              }
          }
          else {
              if (!this.wasScrolled_) {
                  this.adapter_.addClass(cssClasses$1.FIXED_SCROLLED_CLASS);
                  this.wasScrolled_ = true;
              }
          }
      };
      return MDCFixedTopAppBarFoundation;
  }(MDCTopAppBarFoundation));
  //# sourceMappingURL=foundation.js.map

  /**
   * @license
   * Copyright 2018 Google Inc.
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in
   * all copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
   * THE SOFTWARE.
   */
  var MDCShortTopAppBarFoundation = /** @class */ (function (_super) {
      __extends(MDCShortTopAppBarFoundation, _super);
      /* istanbul ignore next: optional argument is not a branch statement */
      function MDCShortTopAppBarFoundation(adapter) {
          var _this = _super.call(this, adapter) || this;
          _this.isCollapsed_ = false;
          _this.isAlwaysCollapsed_ = false;
          return _this;
      }
      Object.defineProperty(MDCShortTopAppBarFoundation.prototype, "isCollapsed", {
          // Public visibility for backward compatibility.
          get: function () {
              return this.isCollapsed_;
          },
          enumerable: true,
          configurable: true
      });
      MDCShortTopAppBarFoundation.prototype.init = function () {
          _super.prototype.init.call(this);
          if (this.adapter_.getTotalActionItems() > 0) {
              this.adapter_.addClass(cssClasses$1.SHORT_HAS_ACTION_ITEM_CLASS);
          }
          // If initialized with SHORT_COLLAPSED_CLASS, the bar should always be collapsed
          this.setAlwaysCollapsed(this.adapter_.hasClass(cssClasses$1.SHORT_COLLAPSED_CLASS));
      };
      /**
       * Set if the short top app bar should always be collapsed.
       *
       * @param value When `true`, bar will always be collapsed. When `false`, bar may collapse or expand based on scroll.
       */
      MDCShortTopAppBarFoundation.prototype.setAlwaysCollapsed = function (value) {
          this.isAlwaysCollapsed_ = !!value;
          if (this.isAlwaysCollapsed_) {
              this.collapse_();
          }
          else {
              // let maybeCollapseBar_ determine if the bar should be collapsed
              this.maybeCollapseBar_();
          }
      };
      MDCShortTopAppBarFoundation.prototype.getAlwaysCollapsed = function () {
          return this.isAlwaysCollapsed_;
      };
      /**
       * Scroll handler for applying/removing the collapsed modifier class on the short top app bar.
       * @override
       */
      MDCShortTopAppBarFoundation.prototype.handleTargetScroll = function () {
          this.maybeCollapseBar_();
      };
      MDCShortTopAppBarFoundation.prototype.maybeCollapseBar_ = function () {
          if (this.isAlwaysCollapsed_) {
              return;
          }
          var currentScroll = this.adapter_.getViewportScrollY();
          if (currentScroll <= 0) {
              if (this.isCollapsed_) {
                  this.uncollapse_();
              }
          }
          else {
              if (!this.isCollapsed_) {
                  this.collapse_();
              }
          }
      };
      MDCShortTopAppBarFoundation.prototype.uncollapse_ = function () {
          this.adapter_.removeClass(cssClasses$1.SHORT_COLLAPSED_CLASS);
          this.isCollapsed_ = false;
      };
      MDCShortTopAppBarFoundation.prototype.collapse_ = function () {
          this.adapter_.addClass(cssClasses$1.SHORT_COLLAPSED_CLASS);
          this.isCollapsed_ = true;
      };
      return MDCShortTopAppBarFoundation;
  }(MDCTopAppBarBaseFoundation));
  //# sourceMappingURL=foundation.js.map

  /**
   * @license
   * Copyright 2018 Google Inc.
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in
   * all copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
   * THE SOFTWARE.
   */
  var MDCTopAppBar = /** @class */ (function (_super) {
      __extends(MDCTopAppBar, _super);
      function MDCTopAppBar() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      MDCTopAppBar.attachTo = function (root) {
          return new MDCTopAppBar(root);
      };
      MDCTopAppBar.prototype.initialize = function (rippleFactory) {
          if (rippleFactory === void 0) { rippleFactory = function (el) { return MDCRipple.attachTo(el); }; }
          this.navIcon_ = this.root_.querySelector(strings$1.NAVIGATION_ICON_SELECTOR);
          // Get all icons in the toolbar and instantiate the ripples
          var icons = [].slice.call(this.root_.querySelectorAll(strings$1.ACTION_ITEM_SELECTOR));
          if (this.navIcon_) {
              icons.push(this.navIcon_);
          }
          this.iconRipples_ = icons.map(function (icon) {
              var ripple = rippleFactory(icon);
              ripple.unbounded = true;
              return ripple;
          });
          this.scrollTarget_ = window;
      };
      MDCTopAppBar.prototype.initialSyncWithDOM = function () {
          this.handleNavigationClick_ = this.foundation_.handleNavigationClick.bind(this.foundation_);
          this.handleWindowResize_ = this.foundation_.handleWindowResize.bind(this.foundation_);
          this.handleTargetScroll_ = this.foundation_.handleTargetScroll.bind(this.foundation_);
          this.scrollTarget_.addEventListener('scroll', this.handleTargetScroll_);
          if (this.navIcon_) {
              this.navIcon_.addEventListener('click', this.handleNavigationClick_);
          }
          var isFixed = this.root_.classList.contains(cssClasses$1.FIXED_CLASS);
          var isShort = this.root_.classList.contains(cssClasses$1.SHORT_CLASS);
          if (!isShort && !isFixed) {
              window.addEventListener('resize', this.handleWindowResize_);
          }
      };
      MDCTopAppBar.prototype.destroy = function () {
          this.iconRipples_.forEach(function (iconRipple) { return iconRipple.destroy(); });
          this.scrollTarget_.removeEventListener('scroll', this.handleTargetScroll_);
          if (this.navIcon_) {
              this.navIcon_.removeEventListener('click', this.handleNavigationClick_);
          }
          var isFixed = this.root_.classList.contains(cssClasses$1.FIXED_CLASS);
          var isShort = this.root_.classList.contains(cssClasses$1.SHORT_CLASS);
          if (!isShort && !isFixed) {
              window.removeEventListener('resize', this.handleWindowResize_);
          }
          _super.prototype.destroy.call(this);
      };
      MDCTopAppBar.prototype.setScrollTarget = function (target) {
          // Remove scroll handler from the previous scroll target
          this.scrollTarget_.removeEventListener('scroll', this.handleTargetScroll_);
          this.scrollTarget_ = target;
          // Initialize scroll handler on the new scroll target
          this.handleTargetScroll_ =
              this.foundation_.handleTargetScroll.bind(this.foundation_);
          this.scrollTarget_.addEventListener('scroll', this.handleTargetScroll_);
      };
      MDCTopAppBar.prototype.getDefaultFoundation = function () {
          var _this = this;
          // DO NOT INLINE this variable. For backward compatibility, foundations take a Partial<MDCFooAdapter>.
          // To ensure we don't accidentally omit any methods, we need a separate, strongly typed adapter variable.
          // tslint:disable:object-literal-sort-keys Methods should be in the same order as the adapter interface.
          var adapter = {
              hasClass: function (className) { return _this.root_.classList.contains(className); },
              addClass: function (className) { return _this.root_.classList.add(className); },
              removeClass: function (className) { return _this.root_.classList.remove(className); },
              setStyle: function (property, value) { return _this.root_.style.setProperty(property, value); },
              getTopAppBarHeight: function () { return _this.root_.clientHeight; },
              notifyNavigationIconClicked: function () { return _this.emit(strings$1.NAVIGATION_EVENT, {}); },
              getViewportScrollY: function () {
                  var win = _this.scrollTarget_;
                  var el = _this.scrollTarget_;
                  return win.pageYOffset !== undefined ? win.pageYOffset : el.scrollTop;
              },
              getTotalActionItems: function () { return _this.root_.querySelectorAll(strings$1.ACTION_ITEM_SELECTOR).length; },
          };
          // tslint:enable:object-literal-sort-keys
          var foundation;
          if (this.root_.classList.contains(cssClasses$1.SHORT_CLASS)) {
              foundation = new MDCShortTopAppBarFoundation(adapter);
          }
          else if (this.root_.classList.contains(cssClasses$1.FIXED_CLASS)) {
              foundation = new MDCFixedTopAppBarFoundation(adapter);
          }
          else {
              foundation = new MDCTopAppBarFoundation(adapter);
          }
          return foundation;
      };
      return MDCTopAppBar;
  }(MDCComponent));
  //# sourceMappingURL=component.js.map

  /* node_modules/@smui/top-app-bar/TopAppBar.svelte generated by Svelte v3.18.1 */

  function create_fragment$2(ctx) {
  	let header;
  	let useActions_action;
  	let forwardEvents_action;
  	let current;
  	let dispose;
  	const default_slot_template = /*$$slots*/ ctx[12].default;
  	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[11], null);

  	let header_levels = [
  		{
  			class: "\n    mdc-top-app-bar\n    " + /*className*/ ctx[1] + "\n    " + (/*variant*/ ctx[2] === "short"
  			? "mdc-top-app-bar--short"
  			: "") + "\n    " + (/*collapsed*/ ctx[4]
  			? "mdc-top-app-bar--short-collapsed"
  			: "") + "\n    " + (/*variant*/ ctx[2] === "fixed"
  			? "mdc-top-app-bar--fixed"
  			: "") + "\n    " + (/*variant*/ ctx[2] === "static"
  			? "smui-top-app-bar--static"
  			: "") + "\n    " + (/*color*/ ctx[3] === "secondary"
  			? "smui-top-app-bar--color-secondary"
  			: "") + "\n    " + (/*prominent*/ ctx[5] ? "mdc-top-app-bar--prominent" : "") + "\n    " + (/*dense*/ ctx[6] ? "mdc-top-app-bar--dense" : "") + "\n  "
  		},
  		exclude(/*$$props*/ ctx[9], ["use", "class", "variant", "color", "collapsed", "prominent", "dense"])
  	];

  	let header_data = {};

  	for (let i = 0; i < header_levels.length; i += 1) {
  		header_data = assign(header_data, header_levels[i]);
  	}

  	return {
  		c() {
  			header = element("header");
  			if (default_slot) default_slot.c();
  			set_attributes(header, header_data);
  		},
  		m(target, anchor) {
  			insert(target, header, anchor);

  			if (default_slot) {
  				default_slot.m(header, null);
  			}

  			/*header_binding*/ ctx[13](header);
  			current = true;

  			dispose = [
  				action_destroyer(useActions_action = useActions.call(null, header, /*use*/ ctx[0])),
  				action_destroyer(forwardEvents_action = /*forwardEvents*/ ctx[8].call(null, header))
  			];
  		},
  		p(ctx, [dirty]) {
  			if (default_slot && default_slot.p && dirty & /*$$scope*/ 2048) {
  				default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[11], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[11], dirty, null));
  			}

  			set_attributes(header, get_spread_update(header_levels, [
  				dirty & /*className, variant, collapsed, color, prominent, dense*/ 126 && {
  					class: "\n    mdc-top-app-bar\n    " + /*className*/ ctx[1] + "\n    " + (/*variant*/ ctx[2] === "short"
  					? "mdc-top-app-bar--short"
  					: "") + "\n    " + (/*collapsed*/ ctx[4]
  					? "mdc-top-app-bar--short-collapsed"
  					: "") + "\n    " + (/*variant*/ ctx[2] === "fixed"
  					? "mdc-top-app-bar--fixed"
  					: "") + "\n    " + (/*variant*/ ctx[2] === "static"
  					? "smui-top-app-bar--static"
  					: "") + "\n    " + (/*color*/ ctx[3] === "secondary"
  					? "smui-top-app-bar--color-secondary"
  					: "") + "\n    " + (/*prominent*/ ctx[5] ? "mdc-top-app-bar--prominent" : "") + "\n    " + (/*dense*/ ctx[6] ? "mdc-top-app-bar--dense" : "") + "\n  "
  				},
  				dirty & /*exclude, $$props*/ 512 && exclude(/*$$props*/ ctx[9], ["use", "class", "variant", "color", "collapsed", "prominent", "dense"])
  			]));

  			if (useActions_action && is_function(useActions_action.update) && dirty & /*use*/ 1) useActions_action.update.call(null, /*use*/ ctx[0]);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(default_slot, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(default_slot, local);
  			current = false;
  		},
  		d(detaching) {
  			if (detaching) detach(header);
  			if (default_slot) default_slot.d(detaching);
  			/*header_binding*/ ctx[13](null);
  			run_all(dispose);
  		}
  	};
  }

  function instance$2($$self, $$props, $$invalidate) {
  	const forwardEvents = forwardEventsBuilder(current_component, ["MDCList:action"]);
  	let { use = [] } = $$props;
  	let { class: className = "" } = $$props;
  	let { variant = "standard" } = $$props;
  	let { color = "primary" } = $$props;
  	let { collapsed = false } = $$props;
  	let { prominent = false } = $$props;
  	let { dense = false } = $$props;
  	let element;
  	let topAppBar;

  	onMount(() => {
  		topAppBar = new MDCTopAppBar(element);
  	});

  	onDestroy(() => {
  		topAppBar && topAppBar.destroy();
  	});

  	let { $$slots = {}, $$scope } = $$props;

  	function header_binding($$value) {
  		binding_callbacks[$$value ? "unshift" : "push"](() => {
  			$$invalidate(7, element = $$value);
  		});
  	}

  	$$self.$set = $$new_props => {
  		$$invalidate(9, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
  		if ("use" in $$new_props) $$invalidate(0, use = $$new_props.use);
  		if ("class" in $$new_props) $$invalidate(1, className = $$new_props.class);
  		if ("variant" in $$new_props) $$invalidate(2, variant = $$new_props.variant);
  		if ("color" in $$new_props) $$invalidate(3, color = $$new_props.color);
  		if ("collapsed" in $$new_props) $$invalidate(4, collapsed = $$new_props.collapsed);
  		if ("prominent" in $$new_props) $$invalidate(5, prominent = $$new_props.prominent);
  		if ("dense" in $$new_props) $$invalidate(6, dense = $$new_props.dense);
  		if ("$$scope" in $$new_props) $$invalidate(11, $$scope = $$new_props.$$scope);
  	};

  	$$props = exclude_internal_props($$props);

  	return [
  		use,
  		className,
  		variant,
  		color,
  		collapsed,
  		prominent,
  		dense,
  		element,
  		forwardEvents,
  		$$props,
  		topAppBar,
  		$$scope,
  		$$slots,
  		header_binding
  	];
  }

  class TopAppBar extends SvelteComponent {
  	constructor(options) {
  		super();

  		init(this, options, instance$2, create_fragment$2, safe_not_equal, {
  			use: 0,
  			class: 1,
  			variant: 2,
  			color: 3,
  			collapsed: 4,
  			prominent: 5,
  			dense: 6
  		});
  	}
  }

  /* node_modules/@smui/common/ClassAdder.svelte generated by Svelte v3.18.1 */

  function create_default_slot(ctx) {
  	let current;
  	const default_slot_template = /*$$slots*/ ctx[8].default;
  	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[9], null);

  	return {
  		c() {
  			if (default_slot) default_slot.c();
  		},
  		m(target, anchor) {
  			if (default_slot) {
  				default_slot.m(target, anchor);
  			}

  			current = true;
  		},
  		p(ctx, dirty) {
  			if (default_slot && default_slot.p && dirty & /*$$scope*/ 512) {
  				default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[9], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[9], dirty, null));
  			}
  		},
  		i(local) {
  			if (current) return;
  			transition_in(default_slot, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(default_slot, local);
  			current = false;
  		},
  		d(detaching) {
  			if (default_slot) default_slot.d(detaching);
  		}
  	};
  }

  function create_fragment$3(ctx) {
  	let switch_instance_anchor;
  	let current;

  	const switch_instance_spread_levels = [
  		{
  			use: [/*forwardEvents*/ ctx[4], .../*use*/ ctx[0]]
  		},
  		{
  			class: "" + (/*smuiClass*/ ctx[3] + " " + /*className*/ ctx[1])
  		},
  		exclude(/*$$props*/ ctx[5], ["use", "class", "component", "forwardEvents"])
  	];

  	var switch_value = /*component*/ ctx[2];

  	function switch_props(ctx) {
  		let switch_instance_props = {
  			$$slots: { default: [create_default_slot] },
  			$$scope: { ctx }
  		};

  		for (let i = 0; i < switch_instance_spread_levels.length; i += 1) {
  			switch_instance_props = assign(switch_instance_props, switch_instance_spread_levels[i]);
  		}

  		return { props: switch_instance_props };
  	}

  	if (switch_value) {
  		var switch_instance = new switch_value(switch_props(ctx));
  	}

  	return {
  		c() {
  			if (switch_instance) create_component(switch_instance.$$.fragment);
  			switch_instance_anchor = empty();
  		},
  		m(target, anchor) {
  			if (switch_instance) {
  				mount_component(switch_instance, target, anchor);
  			}

  			insert(target, switch_instance_anchor, anchor);
  			current = true;
  		},
  		p(ctx, [dirty]) {
  			const switch_instance_changes = (dirty & /*forwardEvents, use, smuiClass, className, exclude, $$props*/ 59)
  			? get_spread_update(switch_instance_spread_levels, [
  					dirty & /*forwardEvents, use*/ 17 && {
  						use: [/*forwardEvents*/ ctx[4], .../*use*/ ctx[0]]
  					},
  					dirty & /*smuiClass, className*/ 10 && {
  						class: "" + (/*smuiClass*/ ctx[3] + " " + /*className*/ ctx[1])
  					},
  					dirty & /*exclude, $$props*/ 32 && get_spread_object(exclude(/*$$props*/ ctx[5], ["use", "class", "component", "forwardEvents"]))
  				])
  			: {};

  			if (dirty & /*$$scope*/ 512) {
  				switch_instance_changes.$$scope = { dirty, ctx };
  			}

  			if (switch_value !== (switch_value = /*component*/ ctx[2])) {
  				if (switch_instance) {
  					group_outros();
  					const old_component = switch_instance;

  					transition_out(old_component.$$.fragment, 1, 0, () => {
  						destroy_component(old_component, 1);
  					});

  					check_outros();
  				}

  				if (switch_value) {
  					switch_instance = new switch_value(switch_props(ctx));
  					create_component(switch_instance.$$.fragment);
  					transition_in(switch_instance.$$.fragment, 1);
  					mount_component(switch_instance, switch_instance_anchor.parentNode, switch_instance_anchor);
  				} else {
  					switch_instance = null;
  				}
  			} else if (switch_value) {
  				switch_instance.$set(switch_instance_changes);
  			}
  		},
  		i(local) {
  			if (current) return;
  			if (switch_instance) transition_in(switch_instance.$$.fragment, local);
  			current = true;
  		},
  		o(local) {
  			if (switch_instance) transition_out(switch_instance.$$.fragment, local);
  			current = false;
  		},
  		d(detaching) {
  			if (detaching) detach(switch_instance_anchor);
  			if (switch_instance) destroy_component(switch_instance, detaching);
  		}
  	};
  }

  const internals = {
  	component: null,
  	smuiClass: null,
  	contexts: {}
  };

  function instance$3($$self, $$props, $$invalidate) {
  	let { use = [] } = $$props;
  	let { class: className = "" } = $$props;
  	let { component = internals.component } = $$props;
  	let { forwardEvents: smuiForwardEvents = [] } = $$props;
  	const smuiClass = internals.class;
  	const contexts = internals.contexts;
  	const forwardEvents = forwardEventsBuilder(current_component, smuiForwardEvents);

  	for (let context in contexts) {
  		if (contexts.hasOwnProperty(context)) {
  			setContext(context, contexts[context]);
  		}
  	}

  	let { $$slots = {}, $$scope } = $$props;

  	$$self.$set = $$new_props => {
  		$$invalidate(5, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
  		if ("use" in $$new_props) $$invalidate(0, use = $$new_props.use);
  		if ("class" in $$new_props) $$invalidate(1, className = $$new_props.class);
  		if ("component" in $$new_props) $$invalidate(2, component = $$new_props.component);
  		if ("forwardEvents" in $$new_props) $$invalidate(6, smuiForwardEvents = $$new_props.forwardEvents);
  		if ("$$scope" in $$new_props) $$invalidate(9, $$scope = $$new_props.$$scope);
  	};

  	$$props = exclude_internal_props($$props);

  	return [
  		use,
  		className,
  		component,
  		smuiClass,
  		forwardEvents,
  		$$props,
  		smuiForwardEvents,
  		contexts,
  		$$slots,
  		$$scope
  	];
  }

  class ClassAdder extends SvelteComponent {
  	constructor(options) {
  		super();

  		init(this, options, instance$3, create_fragment$3, safe_not_equal, {
  			use: 0,
  			class: 1,
  			component: 2,
  			forwardEvents: 6
  		});
  	}
  }

  function classAdderBuilder(props) {
    function Component(...args) {
      Object.assign(internals, props);
      return new ClassAdder(...args);
    }

    Component.prototype = ClassAdder;

    // SSR support
    if (ClassAdder.$$render) {
      Component.$$render = (...args) => Object.assign(internals, props) && ClassAdder.$$render(...args);
    }
    if (ClassAdder.render) {
      Component.render = (...args) => Object.assign(internals, props) && ClassAdder.render(...args);
    }

    return Component;
  }

  /* node_modules/@smui/common/Div.svelte generated by Svelte v3.18.1 */

  function create_fragment$4(ctx) {
  	let div;
  	let useActions_action;
  	let forwardEvents_action;
  	let current;
  	let dispose;
  	const default_slot_template = /*$$slots*/ ctx[4].default;
  	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[3], null);
  	let div_levels = [exclude(/*$$props*/ ctx[2], ["use"])];
  	let div_data = {};

  	for (let i = 0; i < div_levels.length; i += 1) {
  		div_data = assign(div_data, div_levels[i]);
  	}

  	return {
  		c() {
  			div = element("div");
  			if (default_slot) default_slot.c();
  			set_attributes(div, div_data);
  		},
  		m(target, anchor) {
  			insert(target, div, anchor);

  			if (default_slot) {
  				default_slot.m(div, null);
  			}

  			current = true;

  			dispose = [
  				action_destroyer(useActions_action = useActions.call(null, div, /*use*/ ctx[0])),
  				action_destroyer(forwardEvents_action = /*forwardEvents*/ ctx[1].call(null, div))
  			];
  		},
  		p(ctx, [dirty]) {
  			if (default_slot && default_slot.p && dirty & /*$$scope*/ 8) {
  				default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[3], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[3], dirty, null));
  			}

  			set_attributes(div, get_spread_update(div_levels, [dirty & /*exclude, $$props*/ 4 && exclude(/*$$props*/ ctx[2], ["use"])]));
  			if (useActions_action && is_function(useActions_action.update) && dirty & /*use*/ 1) useActions_action.update.call(null, /*use*/ ctx[0]);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(default_slot, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(default_slot, local);
  			current = false;
  		},
  		d(detaching) {
  			if (detaching) detach(div);
  			if (default_slot) default_slot.d(detaching);
  			run_all(dispose);
  		}
  	};
  }

  function instance$4($$self, $$props, $$invalidate) {
  	const forwardEvents = forwardEventsBuilder(current_component);
  	let { use = [] } = $$props;
  	let { $$slots = {}, $$scope } = $$props;

  	$$self.$set = $$new_props => {
  		$$invalidate(2, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
  		if ("use" in $$new_props) $$invalidate(0, use = $$new_props.use);
  		if ("$$scope" in $$new_props) $$invalidate(3, $$scope = $$new_props.$$scope);
  	};

  	$$props = exclude_internal_props($$props);
  	return [use, forwardEvents, $$props, $$scope, $$slots];
  }

  class Div extends SvelteComponent {
  	constructor(options) {
  		super();
  		init(this, options, instance$4, create_fragment$4, safe_not_equal, { use: 0 });
  	}
  }

  var Row = classAdderBuilder({
    class: 'mdc-top-app-bar__row',
    component: Div,
    contexts: {}
  });

  /* node_modules/@smui/top-app-bar/Section.svelte generated by Svelte v3.18.1 */

  function create_fragment$5(ctx) {
  	let section;
  	let useActions_action;
  	let forwardEvents_action;
  	let current;
  	let dispose;
  	const default_slot_template = /*$$slots*/ ctx[7].default;
  	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[6], null);

  	let section_levels = [
  		{
  			class: "\n    mdc-top-app-bar__section\n    " + /*className*/ ctx[1] + "\n    " + (/*align*/ ctx[2] === "start"
  			? "mdc-top-app-bar__section--align-start"
  			: "") + "\n    " + (/*align*/ ctx[2] === "end"
  			? "mdc-top-app-bar__section--align-end"
  			: "") + "\n  "
  		},
  		/*toolbar*/ ctx[3] ? { role: "toolbar" } : {},
  		exclude(/*$$props*/ ctx[5], ["use", "class", "align", "toolbar"])
  	];

  	let section_data = {};

  	for (let i = 0; i < section_levels.length; i += 1) {
  		section_data = assign(section_data, section_levels[i]);
  	}

  	return {
  		c() {
  			section = element("section");
  			if (default_slot) default_slot.c();
  			set_attributes(section, section_data);
  		},
  		m(target, anchor) {
  			insert(target, section, anchor);

  			if (default_slot) {
  				default_slot.m(section, null);
  			}

  			current = true;

  			dispose = [
  				action_destroyer(useActions_action = useActions.call(null, section, /*use*/ ctx[0])),
  				action_destroyer(forwardEvents_action = /*forwardEvents*/ ctx[4].call(null, section))
  			];
  		},
  		p(ctx, [dirty]) {
  			if (default_slot && default_slot.p && dirty & /*$$scope*/ 64) {
  				default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[6], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[6], dirty, null));
  			}

  			set_attributes(section, get_spread_update(section_levels, [
  				dirty & /*className, align*/ 6 && {
  					class: "\n    mdc-top-app-bar__section\n    " + /*className*/ ctx[1] + "\n    " + (/*align*/ ctx[2] === "start"
  					? "mdc-top-app-bar__section--align-start"
  					: "") + "\n    " + (/*align*/ ctx[2] === "end"
  					? "mdc-top-app-bar__section--align-end"
  					: "") + "\n  "
  				},
  				dirty & /*toolbar*/ 8 && (/*toolbar*/ ctx[3] ? { role: "toolbar" } : {}),
  				dirty & /*exclude, $$props*/ 32 && exclude(/*$$props*/ ctx[5], ["use", "class", "align", "toolbar"])
  			]));

  			if (useActions_action && is_function(useActions_action.update) && dirty & /*use*/ 1) useActions_action.update.call(null, /*use*/ ctx[0]);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(default_slot, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(default_slot, local);
  			current = false;
  		},
  		d(detaching) {
  			if (detaching) detach(section);
  			if (default_slot) default_slot.d(detaching);
  			run_all(dispose);
  		}
  	};
  }

  function instance$5($$self, $$props, $$invalidate) {
  	const forwardEvents = forwardEventsBuilder(current_component, ["MDCList:action"]);
  	let { use = [] } = $$props;
  	let { class: className = "" } = $$props;
  	let { align = "start" } = $$props;
  	let { toolbar = false } = $$props;

  	setContext("SMUI:icon-button:context", toolbar
  	? "top-app-bar:action"
  	: "top-app-bar:navigation");

  	setContext("SMUI:button:context", toolbar
  	? "top-app-bar:action"
  	: "top-app-bar:navigation");

  	let { $$slots = {}, $$scope } = $$props;

  	$$self.$set = $$new_props => {
  		$$invalidate(5, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
  		if ("use" in $$new_props) $$invalidate(0, use = $$new_props.use);
  		if ("class" in $$new_props) $$invalidate(1, className = $$new_props.class);
  		if ("align" in $$new_props) $$invalidate(2, align = $$new_props.align);
  		if ("toolbar" in $$new_props) $$invalidate(3, toolbar = $$new_props.toolbar);
  		if ("$$scope" in $$new_props) $$invalidate(6, $$scope = $$new_props.$$scope);
  	};

  	$$props = exclude_internal_props($$props);
  	return [use, className, align, toolbar, forwardEvents, $$props, $$scope, $$slots];
  }

  class Section extends SvelteComponent {
  	constructor(options) {
  		super();
  		init(this, options, instance$5, create_fragment$5, safe_not_equal, { use: 0, class: 1, align: 2, toolbar: 3 });
  	}
  }

  /* node_modules/@smui/common/Span.svelte generated by Svelte v3.18.1 */

  function create_fragment$6(ctx) {
  	let span;
  	let useActions_action;
  	let forwardEvents_action;
  	let current;
  	let dispose;
  	const default_slot_template = /*$$slots*/ ctx[4].default;
  	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[3], null);
  	let span_levels = [exclude(/*$$props*/ ctx[2], ["use"])];
  	let span_data = {};

  	for (let i = 0; i < span_levels.length; i += 1) {
  		span_data = assign(span_data, span_levels[i]);
  	}

  	return {
  		c() {
  			span = element("span");
  			if (default_slot) default_slot.c();
  			set_attributes(span, span_data);
  		},
  		m(target, anchor) {
  			insert(target, span, anchor);

  			if (default_slot) {
  				default_slot.m(span, null);
  			}

  			current = true;

  			dispose = [
  				action_destroyer(useActions_action = useActions.call(null, span, /*use*/ ctx[0])),
  				action_destroyer(forwardEvents_action = /*forwardEvents*/ ctx[1].call(null, span))
  			];
  		},
  		p(ctx, [dirty]) {
  			if (default_slot && default_slot.p && dirty & /*$$scope*/ 8) {
  				default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[3], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[3], dirty, null));
  			}

  			set_attributes(span, get_spread_update(span_levels, [dirty & /*exclude, $$props*/ 4 && exclude(/*$$props*/ ctx[2], ["use"])]));
  			if (useActions_action && is_function(useActions_action.update) && dirty & /*use*/ 1) useActions_action.update.call(null, /*use*/ ctx[0]);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(default_slot, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(default_slot, local);
  			current = false;
  		},
  		d(detaching) {
  			if (detaching) detach(span);
  			if (default_slot) default_slot.d(detaching);
  			run_all(dispose);
  		}
  	};
  }

  function instance$6($$self, $$props, $$invalidate) {
  	const forwardEvents = forwardEventsBuilder(current_component);
  	let { use = [] } = $$props;
  	let { $$slots = {}, $$scope } = $$props;

  	$$self.$set = $$new_props => {
  		$$invalidate(2, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
  		if ("use" in $$new_props) $$invalidate(0, use = $$new_props.use);
  		if ("$$scope" in $$new_props) $$invalidate(3, $$scope = $$new_props.$$scope);
  	};

  	$$props = exclude_internal_props($$props);
  	return [use, forwardEvents, $$props, $$scope, $$slots];
  }

  class Span extends SvelteComponent {
  	constructor(options) {
  		super();
  		init(this, options, instance$6, create_fragment$6, safe_not_equal, { use: 0 });
  	}
  }

  var Title = classAdderBuilder({
    class: 'mdc-top-app-bar__title',
    component: Span,
    contexts: {}
  });

  /**
   * @license
   * Copyright 2018 Google Inc.
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in
   * all copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
   * THE SOFTWARE.
   */
  var cssClasses$2 = {
      ICON_BUTTON_ON: 'mdc-icon-button--on',
      ROOT: 'mdc-icon-button',
  };
  var strings$2 = {
      ARIA_PRESSED: 'aria-pressed',
      CHANGE_EVENT: 'MDCIconButtonToggle:change',
  };
  //# sourceMappingURL=constants.js.map

  /**
   * @license
   * Copyright 2018 Google Inc.
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in
   * all copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
   * THE SOFTWARE.
   */
  var MDCIconButtonToggleFoundation = /** @class */ (function (_super) {
      __extends(MDCIconButtonToggleFoundation, _super);
      function MDCIconButtonToggleFoundation(adapter) {
          return _super.call(this, __assign({}, MDCIconButtonToggleFoundation.defaultAdapter, adapter)) || this;
      }
      Object.defineProperty(MDCIconButtonToggleFoundation, "cssClasses", {
          get: function () {
              return cssClasses$2;
          },
          enumerable: true,
          configurable: true
      });
      Object.defineProperty(MDCIconButtonToggleFoundation, "strings", {
          get: function () {
              return strings$2;
          },
          enumerable: true,
          configurable: true
      });
      Object.defineProperty(MDCIconButtonToggleFoundation, "defaultAdapter", {
          get: function () {
              return {
                  addClass: function () { return undefined; },
                  hasClass: function () { return false; },
                  notifyChange: function () { return undefined; },
                  removeClass: function () { return undefined; },
                  setAttr: function () { return undefined; },
              };
          },
          enumerable: true,
          configurable: true
      });
      MDCIconButtonToggleFoundation.prototype.init = function () {
          this.adapter_.setAttr(strings$2.ARIA_PRESSED, "" + this.isOn());
      };
      MDCIconButtonToggleFoundation.prototype.handleClick = function () {
          this.toggle();
          this.adapter_.notifyChange({ isOn: this.isOn() });
      };
      MDCIconButtonToggleFoundation.prototype.isOn = function () {
          return this.adapter_.hasClass(cssClasses$2.ICON_BUTTON_ON);
      };
      MDCIconButtonToggleFoundation.prototype.toggle = function (isOn) {
          if (isOn === void 0) { isOn = !this.isOn(); }
          if (isOn) {
              this.adapter_.addClass(cssClasses$2.ICON_BUTTON_ON);
          }
          else {
              this.adapter_.removeClass(cssClasses$2.ICON_BUTTON_ON);
          }
          this.adapter_.setAttr(strings$2.ARIA_PRESSED, "" + isOn);
      };
      return MDCIconButtonToggleFoundation;
  }(MDCFoundation));
  //# sourceMappingURL=foundation.js.map

  /**
   * @license
   * Copyright 2018 Google Inc.
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in
   * all copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
   * THE SOFTWARE.
   */
  var strings$3 = MDCIconButtonToggleFoundation.strings;
  var MDCIconButtonToggle = /** @class */ (function (_super) {
      __extends(MDCIconButtonToggle, _super);
      function MDCIconButtonToggle() {
          var _this = _super !== null && _super.apply(this, arguments) || this;
          _this.ripple_ = _this.createRipple_();
          return _this;
      }
      MDCIconButtonToggle.attachTo = function (root) {
          return new MDCIconButtonToggle(root);
      };
      MDCIconButtonToggle.prototype.initialSyncWithDOM = function () {
          var _this = this;
          this.handleClick_ = function () { return _this.foundation_.handleClick(); };
          this.listen('click', this.handleClick_);
      };
      MDCIconButtonToggle.prototype.destroy = function () {
          this.unlisten('click', this.handleClick_);
          this.ripple_.destroy();
          _super.prototype.destroy.call(this);
      };
      MDCIconButtonToggle.prototype.getDefaultFoundation = function () {
          var _this = this;
          // DO NOT INLINE this variable. For backward compatibility, foundations take a Partial<MDCFooAdapter>.
          // To ensure we don't accidentally omit any methods, we need a separate, strongly typed adapter variable.
          var adapter = {
              addClass: function (className) { return _this.root_.classList.add(className); },
              hasClass: function (className) { return _this.root_.classList.contains(className); },
              notifyChange: function (evtData) { return _this.emit(strings$3.CHANGE_EVENT, evtData); },
              removeClass: function (className) { return _this.root_.classList.remove(className); },
              setAttr: function (attrName, attrValue) { return _this.root_.setAttribute(attrName, attrValue); },
          };
          return new MDCIconButtonToggleFoundation(adapter);
      };
      Object.defineProperty(MDCIconButtonToggle.prototype, "ripple", {
          get: function () {
              return this.ripple_;
          },
          enumerable: true,
          configurable: true
      });
      Object.defineProperty(MDCIconButtonToggle.prototype, "on", {
          get: function () {
              return this.foundation_.isOn();
          },
          set: function (isOn) {
              this.foundation_.toggle(isOn);
          },
          enumerable: true,
          configurable: true
      });
      MDCIconButtonToggle.prototype.createRipple_ = function () {
          var ripple = new MDCRipple(this.root_);
          ripple.unbounded = true;
          return ripple;
      };
      return MDCIconButtonToggle;
  }(MDCComponent));
  //# sourceMappingURL=component.js.map

  function Ripple(node, props = {ripple: false, unbounded: false, color: null, classForward: () => {}}) {
    let instance = null;
    let addLayoutListener = getContext('SMUI:addLayoutListener');
    let removeLayoutListener;
    let classList = [];

    function addClass(className) {
      const idx = classList.indexOf(className);
      if (idx === -1) {
        node.classList.add(className);
        classList.push(className);
        if (props.classForward) {
          props.classForward(classList);
          console.log('addClass', className, classList);
        }
      }
    }

    function removeClass(className) {
      const idx = classList.indexOf(className);
      if (idx !== -1) {
        node.classList.remove(className);
        classList.splice(idx, 1);
        if (props.classForward) {
          props.classForward(classList);
          console.log('removeClass', className, classList);
        }
      }
    }

    function handleProps() {
      if (props.ripple && !instance) {
        // Override the Ripple component's adapter, so that we can forward classes
        // to Svelte components that overwrite Ripple's classes.
        const _createAdapter = MDCRipple.createAdapter;
        MDCRipple.createAdapter = function(...args) {
          const adapter = _createAdapter.apply(this, args);
          adapter.addClass = function(className) {
            return addClass(className);
          };
          adapter.removeClass = function(className) {
            return removeClass(className);
          };
          return adapter;
        };
        instance = new MDCRipple(node);
        MDCRipple.createAdapter = _createAdapter;
      } else if (instance && !props.ripple) {
        instance.destroy();
        instance = null;
      }
      if (props.ripple) {
        instance.unbounded = !!props.unbounded;
        switch (props.color) {
          case 'surface':
            addClass('mdc-ripple-surface');
            removeClass('mdc-ripple-surface--primary');
            removeClass('mdc-ripple-surface--accent');
            return;
          case 'primary':
            addClass('mdc-ripple-surface');
            addClass('mdc-ripple-surface--primary');
            removeClass('mdc-ripple-surface--accent');
            return;
          case 'secondary':
            addClass('mdc-ripple-surface');
            removeClass('mdc-ripple-surface--primary');
            addClass('mdc-ripple-surface--accent');
            return;
        }
      }
      removeClass('mdc-ripple-surface');
      removeClass('mdc-ripple-surface--primary');
      removeClass('mdc-ripple-surface--accent');
    }

    handleProps();

    if (addLayoutListener) {
      removeLayoutListener = addLayoutListener(layout);
    }

    function layout() {
      if (instance) {
        instance.layout();
      }
    }

    return {
      update(newProps = {ripple: false, unbounded: false, color: null, classForward: []}) {
        props = newProps;
        handleProps();
      },

      destroy() {
        if (instance) {
          instance.destroy();
          instance = null;
          removeClass('mdc-ripple-surface');
          removeClass('mdc-ripple-surface--primary');
          removeClass('mdc-ripple-surface--accent');
        }

        if (removeLayoutListener) {
          removeLayoutListener();
        }
      }
    }
  }

  /* node_modules/@smui/icon-button/IconButton.svelte generated by Svelte v3.18.1 */

  function create_else_block(ctx) {
  	let button;
  	let useActions_action;
  	let forwardEvents_action;
  	let Ripple_action;
  	let current;
  	let dispose;
  	const default_slot_template = /*$$slots*/ ctx[16].default;
  	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[15], null);

  	let button_levels = [
  		{
  			class: "\n      mdc-icon-button\n      " + /*className*/ ctx[2] + "\n      " + (/*pressed*/ ctx[0] ? "mdc-icon-button--on" : "") + "\n      " + (/*context*/ ctx[10] === "card:action"
  			? "mdc-card__action"
  			: "") + "\n      " + (/*context*/ ctx[10] === "card:action"
  			? "mdc-card__action--icon"
  			: "") + "\n      " + (/*context*/ ctx[10] === "top-app-bar:navigation"
  			? "mdc-top-app-bar__navigation-icon"
  			: "") + "\n      " + (/*context*/ ctx[10] === "top-app-bar:action"
  			? "mdc-top-app-bar__action-item"
  			: "") + "\n      " + (/*context*/ ctx[10] === "snackbar"
  			? "mdc-snackbar__dismiss"
  			: "") + "\n    "
  		},
  		{ "aria-hidden": "true" },
  		{ "aria-pressed": /*pressed*/ ctx[0] },
  		/*props*/ ctx[8]
  	];

  	let button_data = {};

  	for (let i = 0; i < button_levels.length; i += 1) {
  		button_data = assign(button_data, button_levels[i]);
  	}

  	return {
  		c() {
  			button = element("button");
  			if (default_slot) default_slot.c();
  			set_attributes(button, button_data);
  		},
  		m(target, anchor) {
  			insert(target, button, anchor);

  			if (default_slot) {
  				default_slot.m(button, null);
  			}

  			/*button_binding*/ ctx[18](button);
  			current = true;

  			dispose = [
  				action_destroyer(useActions_action = useActions.call(null, button, /*use*/ ctx[1])),
  				action_destroyer(forwardEvents_action = /*forwardEvents*/ ctx[9].call(null, button)),
  				action_destroyer(Ripple_action = Ripple.call(null, button, {
  					ripple: /*ripple*/ ctx[3] && !/*toggle*/ ctx[5],
  					unbounded: true,
  					color: /*color*/ ctx[4]
  				})),
  				listen(button, "MDCIconButtonToggle:change", /*handleChange*/ ctx[11])
  			];
  		},
  		p(ctx, dirty) {
  			if (default_slot && default_slot.p && dirty & /*$$scope*/ 32768) {
  				default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[15], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[15], dirty, null));
  			}

  			set_attributes(button, get_spread_update(button_levels, [
  				dirty & /*className, pressed, context*/ 1029 && {
  					class: "\n      mdc-icon-button\n      " + /*className*/ ctx[2] + "\n      " + (/*pressed*/ ctx[0] ? "mdc-icon-button--on" : "") + "\n      " + (/*context*/ ctx[10] === "card:action"
  					? "mdc-card__action"
  					: "") + "\n      " + (/*context*/ ctx[10] === "card:action"
  					? "mdc-card__action--icon"
  					: "") + "\n      " + (/*context*/ ctx[10] === "top-app-bar:navigation"
  					? "mdc-top-app-bar__navigation-icon"
  					: "") + "\n      " + (/*context*/ ctx[10] === "top-app-bar:action"
  					? "mdc-top-app-bar__action-item"
  					: "") + "\n      " + (/*context*/ ctx[10] === "snackbar"
  					? "mdc-snackbar__dismiss"
  					: "") + "\n    "
  				},
  				{ "aria-hidden": "true" },
  				dirty & /*pressed*/ 1 && { "aria-pressed": /*pressed*/ ctx[0] },
  				dirty & /*props*/ 256 && /*props*/ ctx[8]
  			]));

  			if (useActions_action && is_function(useActions_action.update) && dirty & /*use*/ 2) useActions_action.update.call(null, /*use*/ ctx[1]);

  			if (Ripple_action && is_function(Ripple_action.update) && dirty & /*ripple, toggle, color*/ 56) Ripple_action.update.call(null, {
  				ripple: /*ripple*/ ctx[3] && !/*toggle*/ ctx[5],
  				unbounded: true,
  				color: /*color*/ ctx[4]
  			});
  		},
  		i(local) {
  			if (current) return;
  			transition_in(default_slot, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(default_slot, local);
  			current = false;
  		},
  		d(detaching) {
  			if (detaching) detach(button);
  			if (default_slot) default_slot.d(detaching);
  			/*button_binding*/ ctx[18](null);
  			run_all(dispose);
  		}
  	};
  }

  // (1:0) {#if href}
  function create_if_block(ctx) {
  	let a;
  	let useActions_action;
  	let forwardEvents_action;
  	let Ripple_action;
  	let current;
  	let dispose;
  	const default_slot_template = /*$$slots*/ ctx[16].default;
  	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[15], null);

  	let a_levels = [
  		{
  			class: "\n      mdc-icon-button\n      " + /*className*/ ctx[2] + "\n      " + (/*pressed*/ ctx[0] ? "mdc-icon-button--on" : "") + "\n      " + (/*context*/ ctx[10] === "card:action"
  			? "mdc-card__action"
  			: "") + "\n      " + (/*context*/ ctx[10] === "card:action"
  			? "mdc-card__action--icon"
  			: "") + "\n      " + (/*context*/ ctx[10] === "top-app-bar:navigation"
  			? "mdc-top-app-bar__navigation-icon"
  			: "") + "\n      " + (/*context*/ ctx[10] === "top-app-bar:action"
  			? "mdc-top-app-bar__action-item"
  			: "") + "\n      " + (/*context*/ ctx[10] === "snackbar"
  			? "mdc-snackbar__dismiss"
  			: "") + "\n    "
  		},
  		{ "aria-hidden": "true" },
  		{ "aria-pressed": /*pressed*/ ctx[0] },
  		{ href: /*href*/ ctx[6] },
  		/*props*/ ctx[8]
  	];

  	let a_data = {};

  	for (let i = 0; i < a_levels.length; i += 1) {
  		a_data = assign(a_data, a_levels[i]);
  	}

  	return {
  		c() {
  			a = element("a");
  			if (default_slot) default_slot.c();
  			set_attributes(a, a_data);
  		},
  		m(target, anchor) {
  			insert(target, a, anchor);

  			if (default_slot) {
  				default_slot.m(a, null);
  			}

  			/*a_binding*/ ctx[17](a);
  			current = true;

  			dispose = [
  				action_destroyer(useActions_action = useActions.call(null, a, /*use*/ ctx[1])),
  				action_destroyer(forwardEvents_action = /*forwardEvents*/ ctx[9].call(null, a)),
  				action_destroyer(Ripple_action = Ripple.call(null, a, {
  					ripple: /*ripple*/ ctx[3] && !/*toggle*/ ctx[5],
  					unbounded: true,
  					color: /*color*/ ctx[4]
  				})),
  				listen(a, "MDCIconButtonToggle:change", /*handleChange*/ ctx[11])
  			];
  		},
  		p(ctx, dirty) {
  			if (default_slot && default_slot.p && dirty & /*$$scope*/ 32768) {
  				default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[15], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[15], dirty, null));
  			}

  			set_attributes(a, get_spread_update(a_levels, [
  				dirty & /*className, pressed, context*/ 1029 && {
  					class: "\n      mdc-icon-button\n      " + /*className*/ ctx[2] + "\n      " + (/*pressed*/ ctx[0] ? "mdc-icon-button--on" : "") + "\n      " + (/*context*/ ctx[10] === "card:action"
  					? "mdc-card__action"
  					: "") + "\n      " + (/*context*/ ctx[10] === "card:action"
  					? "mdc-card__action--icon"
  					: "") + "\n      " + (/*context*/ ctx[10] === "top-app-bar:navigation"
  					? "mdc-top-app-bar__navigation-icon"
  					: "") + "\n      " + (/*context*/ ctx[10] === "top-app-bar:action"
  					? "mdc-top-app-bar__action-item"
  					: "") + "\n      " + (/*context*/ ctx[10] === "snackbar"
  					? "mdc-snackbar__dismiss"
  					: "") + "\n    "
  				},
  				{ "aria-hidden": "true" },
  				dirty & /*pressed*/ 1 && { "aria-pressed": /*pressed*/ ctx[0] },
  				dirty & /*href*/ 64 && { href: /*href*/ ctx[6] },
  				dirty & /*props*/ 256 && /*props*/ ctx[8]
  			]));

  			if (useActions_action && is_function(useActions_action.update) && dirty & /*use*/ 2) useActions_action.update.call(null, /*use*/ ctx[1]);

  			if (Ripple_action && is_function(Ripple_action.update) && dirty & /*ripple, toggle, color*/ 56) Ripple_action.update.call(null, {
  				ripple: /*ripple*/ ctx[3] && !/*toggle*/ ctx[5],
  				unbounded: true,
  				color: /*color*/ ctx[4]
  			});
  		},
  		i(local) {
  			if (current) return;
  			transition_in(default_slot, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(default_slot, local);
  			current = false;
  		},
  		d(detaching) {
  			if (detaching) detach(a);
  			if (default_slot) default_slot.d(detaching);
  			/*a_binding*/ ctx[17](null);
  			run_all(dispose);
  		}
  	};
  }

  function create_fragment$7(ctx) {
  	let current_block_type_index;
  	let if_block;
  	let if_block_anchor;
  	let current;
  	const if_block_creators = [create_if_block, create_else_block];
  	const if_blocks = [];

  	function select_block_type(ctx, dirty) {
  		if (/*href*/ ctx[6]) return 0;
  		return 1;
  	}

  	current_block_type_index = select_block_type(ctx);
  	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

  	return {
  		c() {
  			if_block.c();
  			if_block_anchor = empty();
  		},
  		m(target, anchor) {
  			if_blocks[current_block_type_index].m(target, anchor);
  			insert(target, if_block_anchor, anchor);
  			current = true;
  		},
  		p(ctx, [dirty]) {
  			let previous_block_index = current_block_type_index;
  			current_block_type_index = select_block_type(ctx);

  			if (current_block_type_index === previous_block_index) {
  				if_blocks[current_block_type_index].p(ctx, dirty);
  			} else {
  				group_outros();

  				transition_out(if_blocks[previous_block_index], 1, 1, () => {
  					if_blocks[previous_block_index] = null;
  				});

  				check_outros();
  				if_block = if_blocks[current_block_type_index];

  				if (!if_block) {
  					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
  					if_block.c();
  				}

  				transition_in(if_block, 1);
  				if_block.m(if_block_anchor.parentNode, if_block_anchor);
  			}
  		},
  		i(local) {
  			if (current) return;
  			transition_in(if_block);
  			current = true;
  		},
  		o(local) {
  			transition_out(if_block);
  			current = false;
  		},
  		d(detaching) {
  			if_blocks[current_block_type_index].d(detaching);
  			if (detaching) detach(if_block_anchor);
  		}
  	};
  }

  function instance$7($$self, $$props, $$invalidate) {
  	const forwardEvents = forwardEventsBuilder(current_component, ["MDCIconButtonToggle:change"]);
  	let { use = [] } = $$props;
  	let { class: className = "" } = $$props;
  	let { ripple = true } = $$props;
  	let { color = null } = $$props;
  	let { toggle = false } = $$props;
  	let { pressed = false } = $$props;
  	let { href = null } = $$props;
  	let element;
  	let toggleButton;
  	let context = getContext("SMUI:icon-button:context");
  	setContext("SMUI:icon:context", "icon-button");
  	let oldToggle = null;

  	onDestroy(() => {
  		toggleButton && toggleButton.destroy();
  	});

  	function handleChange(e) {
  		$$invalidate(0, pressed = e.detail.isOn);
  	}

  	let { $$slots = {}, $$scope } = $$props;

  	function a_binding($$value) {
  		binding_callbacks[$$value ? "unshift" : "push"](() => {
  			$$invalidate(7, element = $$value);
  		});
  	}

  	function button_binding($$value) {
  		binding_callbacks[$$value ? "unshift" : "push"](() => {
  			$$invalidate(7, element = $$value);
  		});
  	}

  	$$self.$set = $$new_props => {
  		$$invalidate(14, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
  		if ("use" in $$new_props) $$invalidate(1, use = $$new_props.use);
  		if ("class" in $$new_props) $$invalidate(2, className = $$new_props.class);
  		if ("ripple" in $$new_props) $$invalidate(3, ripple = $$new_props.ripple);
  		if ("color" in $$new_props) $$invalidate(4, color = $$new_props.color);
  		if ("toggle" in $$new_props) $$invalidate(5, toggle = $$new_props.toggle);
  		if ("pressed" in $$new_props) $$invalidate(0, pressed = $$new_props.pressed);
  		if ("href" in $$new_props) $$invalidate(6, href = $$new_props.href);
  		if ("$$scope" in $$new_props) $$invalidate(15, $$scope = $$new_props.$$scope);
  	};

  	let props;

  	$$self.$$.update = () => {
  		 $$invalidate(8, props = exclude($$props, ["use", "class", "ripple", "color", "toggle", "pressed", "href"]));

  		if ($$self.$$.dirty & /*element, toggle, oldToggle, ripple, toggleButton, pressed*/ 12457) {
  			 if (element && toggle !== oldToggle) {
  				if (toggle) {
  					$$invalidate(12, toggleButton = new MDCIconButtonToggle(element));

  					if (!ripple) {
  						toggleButton.ripple.destroy();
  					}

  					$$invalidate(12, toggleButton.on = pressed, toggleButton);
  				} else if (oldToggle) {
  					toggleButton && toggleButton.destroy();
  					$$invalidate(12, toggleButton = null);
  				}

  				$$invalidate(13, oldToggle = toggle);
  			}
  		}

  		if ($$self.$$.dirty & /*toggleButton, pressed*/ 4097) {
  			 if (toggleButton && toggleButton.on !== pressed) {
  				$$invalidate(12, toggleButton.on = pressed, toggleButton);
  			}
  		}
  	};

  	$$props = exclude_internal_props($$props);

  	return [
  		pressed,
  		use,
  		className,
  		ripple,
  		color,
  		toggle,
  		href,
  		element,
  		props,
  		forwardEvents,
  		context,
  		handleChange,
  		toggleButton,
  		oldToggle,
  		$$props,
  		$$scope,
  		$$slots,
  		a_binding,
  		button_binding
  	];
  }

  class IconButton extends SvelteComponent {
  	constructor(options) {
  		super();

  		init(this, options, instance$7, create_fragment$7, safe_not_equal, {
  			use: 1,
  			class: 2,
  			ripple: 3,
  			color: 4,
  			toggle: 5,
  			pressed: 0,
  			href: 6
  		});
  	}
  }

  /* node_modules/@smui/common/Icon.svelte generated by Svelte v3.18.1 */

  function create_fragment$8(ctx) {
  	let i;
  	let useActions_action;
  	let forwardEvents_action;
  	let current;
  	let dispose;
  	const default_slot_template = /*$$slots*/ ctx[10].default;
  	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[9], null);

  	let i_levels = [
  		{
  			class: "\n    " + /*className*/ ctx[1] + "\n    " + (/*context*/ ctx[7] === "button"
  			? "mdc-button__icon"
  			: "") + "\n    " + (/*context*/ ctx[7] === "fab" ? "mdc-fab__icon" : "") + "\n    " + (/*context*/ ctx[7] === "icon-button"
  			? "mdc-icon-button__icon"
  			: "") + "\n    " + (/*context*/ ctx[7] === "icon-button" && /*on*/ ctx[2]
  			? "mdc-icon-button__icon--on"
  			: "") + "\n    " + (/*context*/ ctx[7] === "chip" ? "mdc-chip__icon" : "") + "\n    " + (/*context*/ ctx[7] === "chip" && /*leading*/ ctx[3]
  			? "mdc-chip__icon--leading"
  			: "") + "\n    " + (/*context*/ ctx[7] === "chip" && /*leadingHidden*/ ctx[4]
  			? "mdc-chip__icon--leading-hidden"
  			: "") + "\n    " + (/*context*/ ctx[7] === "chip" && /*trailing*/ ctx[5]
  			? "mdc-chip__icon--trailing"
  			: "") + "\n    " + (/*context*/ ctx[7] === "tab" ? "mdc-tab__icon" : "") + "\n  "
  		},
  		{ "aria-hidden": "true" },
  		exclude(/*$$props*/ ctx[8], ["use", "class", "on", "leading", "leadingHidden", "trailing"])
  	];

  	let i_data = {};

  	for (let i = 0; i < i_levels.length; i += 1) {
  		i_data = assign(i_data, i_levels[i]);
  	}

  	return {
  		c() {
  			i = element("i");
  			if (default_slot) default_slot.c();
  			set_attributes(i, i_data);
  		},
  		m(target, anchor) {
  			insert(target, i, anchor);

  			if (default_slot) {
  				default_slot.m(i, null);
  			}

  			current = true;

  			dispose = [
  				action_destroyer(useActions_action = useActions.call(null, i, /*use*/ ctx[0])),
  				action_destroyer(forwardEvents_action = /*forwardEvents*/ ctx[6].call(null, i))
  			];
  		},
  		p(ctx, [dirty]) {
  			if (default_slot && default_slot.p && dirty & /*$$scope*/ 512) {
  				default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[9], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[9], dirty, null));
  			}

  			set_attributes(i, get_spread_update(i_levels, [
  				dirty & /*className, context, on, leading, leadingHidden, trailing*/ 190 && {
  					class: "\n    " + /*className*/ ctx[1] + "\n    " + (/*context*/ ctx[7] === "button"
  					? "mdc-button__icon"
  					: "") + "\n    " + (/*context*/ ctx[7] === "fab" ? "mdc-fab__icon" : "") + "\n    " + (/*context*/ ctx[7] === "icon-button"
  					? "mdc-icon-button__icon"
  					: "") + "\n    " + (/*context*/ ctx[7] === "icon-button" && /*on*/ ctx[2]
  					? "mdc-icon-button__icon--on"
  					: "") + "\n    " + (/*context*/ ctx[7] === "chip" ? "mdc-chip__icon" : "") + "\n    " + (/*context*/ ctx[7] === "chip" && /*leading*/ ctx[3]
  					? "mdc-chip__icon--leading"
  					: "") + "\n    " + (/*context*/ ctx[7] === "chip" && /*leadingHidden*/ ctx[4]
  					? "mdc-chip__icon--leading-hidden"
  					: "") + "\n    " + (/*context*/ ctx[7] === "chip" && /*trailing*/ ctx[5]
  					? "mdc-chip__icon--trailing"
  					: "") + "\n    " + (/*context*/ ctx[7] === "tab" ? "mdc-tab__icon" : "") + "\n  "
  				},
  				{ "aria-hidden": "true" },
  				dirty & /*exclude, $$props*/ 256 && exclude(/*$$props*/ ctx[8], ["use", "class", "on", "leading", "leadingHidden", "trailing"])
  			]));

  			if (useActions_action && is_function(useActions_action.update) && dirty & /*use*/ 1) useActions_action.update.call(null, /*use*/ ctx[0]);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(default_slot, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(default_slot, local);
  			current = false;
  		},
  		d(detaching) {
  			if (detaching) detach(i);
  			if (default_slot) default_slot.d(detaching);
  			run_all(dispose);
  		}
  	};
  }

  function instance$8($$self, $$props, $$invalidate) {
  	const forwardEvents = forwardEventsBuilder(current_component);
  	let { use = [] } = $$props;
  	let { class: className = "" } = $$props;
  	let { on = false } = $$props;
  	let { leading = false } = $$props;
  	let { leadingHidden = false } = $$props;
  	let { trailing = false } = $$props;
  	const context = getContext("SMUI:icon:context");
  	let { $$slots = {}, $$scope } = $$props;

  	$$self.$set = $$new_props => {
  		$$invalidate(8, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
  		if ("use" in $$new_props) $$invalidate(0, use = $$new_props.use);
  		if ("class" in $$new_props) $$invalidate(1, className = $$new_props.class);
  		if ("on" in $$new_props) $$invalidate(2, on = $$new_props.on);
  		if ("leading" in $$new_props) $$invalidate(3, leading = $$new_props.leading);
  		if ("leadingHidden" in $$new_props) $$invalidate(4, leadingHidden = $$new_props.leadingHidden);
  		if ("trailing" in $$new_props) $$invalidate(5, trailing = $$new_props.trailing);
  		if ("$$scope" in $$new_props) $$invalidate(9, $$scope = $$new_props.$$scope);
  	};

  	$$props = exclude_internal_props($$props);

  	return [
  		use,
  		className,
  		on,
  		leading,
  		leadingHidden,
  		trailing,
  		forwardEvents,
  		context,
  		$$props,
  		$$scope,
  		$$slots
  	];
  }

  class Icon extends SvelteComponent {
  	constructor(options) {
  		super();

  		init(this, options, instance$8, create_fragment$8, safe_not_equal, {
  			use: 0,
  			class: 1,
  			on: 2,
  			leading: 3,
  			leadingHidden: 4,
  			trailing: 5
  		});
  	}
  }

  var candidateSelectors = [
    'input',
    'select',
    'textarea',
    'a[href]',
    'button',
    '[tabindex]',
    'audio[controls]',
    'video[controls]',
    '[contenteditable]:not([contenteditable="false"])',
  ];
  var candidateSelector = candidateSelectors.join(',');

  var matches$1 = typeof Element === 'undefined'
    ? function () {}
    : Element.prototype.matches || Element.prototype.msMatchesSelector || Element.prototype.webkitMatchesSelector;

  function tabbable(el, options) {
    options = options || {};

    var regularTabbables = [];
    var orderedTabbables = [];

    var candidates = el.querySelectorAll(candidateSelector);

    if (options.includeContainer) {
      if (matches$1.call(el, candidateSelector)) {
        candidates = Array.prototype.slice.apply(candidates);
        candidates.unshift(el);
      }
    }

    var i, candidate, candidateTabindex;
    for (i = 0; i < candidates.length; i++) {
      candidate = candidates[i];

      if (!isNodeMatchingSelectorTabbable(candidate)) continue;

      candidateTabindex = getTabindex(candidate);
      if (candidateTabindex === 0) {
        regularTabbables.push(candidate);
      } else {
        orderedTabbables.push({
          documentOrder: i,
          tabIndex: candidateTabindex,
          node: candidate,
        });
      }
    }

    var tabbableNodes = orderedTabbables
      .sort(sortOrderedTabbables)
      .map(function(a) { return a.node })
      .concat(regularTabbables);

    return tabbableNodes;
  }

  tabbable.isTabbable = isTabbable;
  tabbable.isFocusable = isFocusable;

  function isNodeMatchingSelectorTabbable(node) {
    if (
      !isNodeMatchingSelectorFocusable(node)
      || isNonTabbableRadio(node)
      || getTabindex(node) < 0
    ) {
      return false;
    }
    return true;
  }

  function isTabbable(node) {
    if (!node) throw new Error('No node provided');
    if (matches$1.call(node, candidateSelector) === false) return false;
    return isNodeMatchingSelectorTabbable(node);
  }

  function isNodeMatchingSelectorFocusable(node) {
    if (
      node.disabled
      || isHiddenInput(node)
      || isHidden(node)
    ) {
      return false;
    }
    return true;
  }

  var focusableCandidateSelector = candidateSelectors.concat('iframe').join(',');
  function isFocusable(node) {
    if (!node) throw new Error('No node provided');
    if (matches$1.call(node, focusableCandidateSelector) === false) return false;
    return isNodeMatchingSelectorFocusable(node);
  }

  function getTabindex(node) {
    var tabindexAttr = parseInt(node.getAttribute('tabindex'), 10);
    if (!isNaN(tabindexAttr)) return tabindexAttr;
    // Browsers do not return `tabIndex` correctly for contentEditable nodes;
    // so if they don't have a tabindex attribute specifically set, assume it's 0.
    if (isContentEditable(node)) return 0;
    return node.tabIndex;
  }

  function sortOrderedTabbables(a, b) {
    return a.tabIndex === b.tabIndex ? a.documentOrder - b.documentOrder : a.tabIndex - b.tabIndex;
  }

  function isContentEditable(node) {
    return node.contentEditable === 'true';
  }

  function isInput(node) {
    return node.tagName === 'INPUT';
  }

  function isHiddenInput(node) {
    return isInput(node) && node.type === 'hidden';
  }

  function isRadio(node) {
    return isInput(node) && node.type === 'radio';
  }

  function isNonTabbableRadio(node) {
    return isRadio(node) && !isTabbableRadio(node);
  }

  function getCheckedRadio(nodes) {
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].checked) {
        return nodes[i];
      }
    }
  }

  function isTabbableRadio(node) {
    if (!node.name) return true;
    // This won't account for the edge case where you have radio groups with the same
    // in separate forms on the same page.
    var radioSet = node.ownerDocument.querySelectorAll('input[type="radio"][name="' + node.name + '"]');
    var checked = getCheckedRadio(radioSet);
    return !checked || checked === node;
  }

  function isHidden(node) {
    // offsetParent being null will allow detecting cases where an element is invisible or inside an invisible element,
    // as long as the element does not use position: fixed. For them, their visibility has to be checked directly as well.
    return node.offsetParent === null || getComputedStyle(node).visibility === 'hidden';
  }

  var tabbable_1 = tabbable;

  var immutable = extend;

  var hasOwnProperty = Object.prototype.hasOwnProperty;

  function extend() {
      var target = {};

      for (var i = 0; i < arguments.length; i++) {
          var source = arguments[i];

          for (var key in source) {
              if (hasOwnProperty.call(source, key)) {
                  target[key] = source[key];
              }
          }
      }

      return target
  }

  var activeFocusDelay;

  var activeFocusTraps = (function() {
    var trapQueue = [];
    return {
      activateTrap: function(trap) {
        if (trapQueue.length > 0) {
          var activeTrap = trapQueue[trapQueue.length - 1];
          if (activeTrap !== trap) {
            activeTrap.pause();
          }
        }

        var trapIndex = trapQueue.indexOf(trap);
        if (trapIndex === -1) {
          trapQueue.push(trap);
        } else {
          // move this existing trap to the front of the queue
          trapQueue.splice(trapIndex, 1);
          trapQueue.push(trap);
        }
      },

      deactivateTrap: function(trap) {
        var trapIndex = trapQueue.indexOf(trap);
        if (trapIndex !== -1) {
          trapQueue.splice(trapIndex, 1);
        }

        if (trapQueue.length > 0) {
          trapQueue[trapQueue.length - 1].unpause();
        }
      }
    };
  })();

  function focusTrap(element, userOptions) {
    var doc = document;
    var container =
      typeof element === 'string' ? doc.querySelector(element) : element;

    var config = immutable(
      {
        returnFocusOnDeactivate: true,
        escapeDeactivates: true
      },
      userOptions
    );

    var state = {
      firstTabbableNode: null,
      lastTabbableNode: null,
      nodeFocusedBeforeActivation: null,
      mostRecentlyFocusedNode: null,
      active: false,
      paused: false
    };

    var trap = {
      activate: activate,
      deactivate: deactivate,
      pause: pause,
      unpause: unpause
    };

    return trap;

    function activate(activateOptions) {
      if (state.active) return;

      updateTabbableNodes();

      state.active = true;
      state.paused = false;
      state.nodeFocusedBeforeActivation = doc.activeElement;

      var onActivate =
        activateOptions && activateOptions.onActivate
          ? activateOptions.onActivate
          : config.onActivate;
      if (onActivate) {
        onActivate();
      }

      addListeners();
      return trap;
    }

    function deactivate(deactivateOptions) {
      if (!state.active) return;

      clearTimeout(activeFocusDelay);

      removeListeners();
      state.active = false;
      state.paused = false;

      activeFocusTraps.deactivateTrap(trap);

      var onDeactivate =
        deactivateOptions && deactivateOptions.onDeactivate !== undefined
          ? deactivateOptions.onDeactivate
          : config.onDeactivate;
      if (onDeactivate) {
        onDeactivate();
      }

      var returnFocus =
        deactivateOptions && deactivateOptions.returnFocus !== undefined
          ? deactivateOptions.returnFocus
          : config.returnFocusOnDeactivate;
      if (returnFocus) {
        delay(function() {
          tryFocus(getReturnFocusNode(state.nodeFocusedBeforeActivation));
        });
      }

      return trap;
    }

    function pause() {
      if (state.paused || !state.active) return;
      state.paused = true;
      removeListeners();
    }

    function unpause() {
      if (!state.paused || !state.active) return;
      state.paused = false;
      updateTabbableNodes();
      addListeners();
    }

    function addListeners() {
      if (!state.active) return;

      // There can be only one listening focus trap at a time
      activeFocusTraps.activateTrap(trap);

      // Delay ensures that the focused element doesn't capture the event
      // that caused the focus trap activation.
      activeFocusDelay = delay(function() {
        tryFocus(getInitialFocusNode());
      });

      doc.addEventListener('focusin', checkFocusIn, true);
      doc.addEventListener('mousedown', checkPointerDown, {
        capture: true,
        passive: false
      });
      doc.addEventListener('touchstart', checkPointerDown, {
        capture: true,
        passive: false
      });
      doc.addEventListener('click', checkClick, {
        capture: true,
        passive: false
      });
      doc.addEventListener('keydown', checkKey, {
        capture: true,
        passive: false
      });

      return trap;
    }

    function removeListeners() {
      if (!state.active) return;

      doc.removeEventListener('focusin', checkFocusIn, true);
      doc.removeEventListener('mousedown', checkPointerDown, true);
      doc.removeEventListener('touchstart', checkPointerDown, true);
      doc.removeEventListener('click', checkClick, true);
      doc.removeEventListener('keydown', checkKey, true);

      return trap;
    }

    function getNodeForOption(optionName) {
      var optionValue = config[optionName];
      var node = optionValue;
      if (!optionValue) {
        return null;
      }
      if (typeof optionValue === 'string') {
        node = doc.querySelector(optionValue);
        if (!node) {
          throw new Error('`' + optionName + '` refers to no known node');
        }
      }
      if (typeof optionValue === 'function') {
        node = optionValue();
        if (!node) {
          throw new Error('`' + optionName + '` did not return a node');
        }
      }
      return node;
    }

    function getInitialFocusNode() {
      var node;
      if (getNodeForOption('initialFocus') !== null) {
        node = getNodeForOption('initialFocus');
      } else if (container.contains(doc.activeElement)) {
        node = doc.activeElement;
      } else {
        node = state.firstTabbableNode || getNodeForOption('fallbackFocus');
      }

      if (!node) {
        throw new Error(
          'Your focus-trap needs to have at least one focusable element'
        );
      }

      return node;
    }

    function getReturnFocusNode(previousActiveElement) {
      var node = getNodeForOption('setReturnFocus');
      return node ? node : previousActiveElement;
    }

    // This needs to be done on mousedown and touchstart instead of click
    // so that it precedes the focus event.
    function checkPointerDown(e) {
      if (container.contains(e.target)) return;
      if (config.clickOutsideDeactivates) {
        deactivate({
          returnFocus: !tabbable_1.isFocusable(e.target)
        });
        return;
      }
      // This is needed for mobile devices.
      // (If we'll only let `click` events through,
      // then on mobile they will be blocked anyways if `touchstart` is blocked.)
      if (config.allowOutsideClick && config.allowOutsideClick(e)) {
        return;
      }
      e.preventDefault();
    }

    // In case focus escapes the trap for some strange reason, pull it back in.
    function checkFocusIn(e) {
      // In Firefox when you Tab out of an iframe the Document is briefly focused.
      if (container.contains(e.target) || e.target instanceof Document) {
        return;
      }
      e.stopImmediatePropagation();
      tryFocus(state.mostRecentlyFocusedNode || getInitialFocusNode());
    }

    function checkKey(e) {
      if (config.escapeDeactivates !== false && isEscapeEvent(e)) {
        e.preventDefault();
        deactivate();
        return;
      }
      if (isTabEvent(e)) {
        checkTab(e);
        return;
      }
    }

    // Hijack Tab events on the first and last focusable nodes of the trap,
    // in order to prevent focus from escaping. If it escapes for even a
    // moment it can end up scrolling the page and causing confusion so we
    // kind of need to capture the action at the keydown phase.
    function checkTab(e) {
      updateTabbableNodes();
      if (e.shiftKey && e.target === state.firstTabbableNode) {
        e.preventDefault();
        tryFocus(state.lastTabbableNode);
        return;
      }
      if (!e.shiftKey && e.target === state.lastTabbableNode) {
        e.preventDefault();
        tryFocus(state.firstTabbableNode);
        return;
      }
    }

    function checkClick(e) {
      if (config.clickOutsideDeactivates) return;
      if (container.contains(e.target)) return;
      if (config.allowOutsideClick && config.allowOutsideClick(e)) {
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
    }

    function updateTabbableNodes() {
      var tabbableNodes = tabbable_1(container);
      state.firstTabbableNode = tabbableNodes[0] || getInitialFocusNode();
      state.lastTabbableNode =
        tabbableNodes[tabbableNodes.length - 1] || getInitialFocusNode();
    }

    function tryFocus(node) {
      if (node === doc.activeElement) return;
      if (!node || !node.focus) {
        tryFocus(getInitialFocusNode());
        return;
      }
      node.focus();
      state.mostRecentlyFocusedNode = node;
      if (isSelectableInput(node)) {
        node.select();
      }
    }
  }

  function isSelectableInput(node) {
    return (
      node.tagName &&
      node.tagName.toLowerCase() === 'input' &&
      typeof node.select === 'function'
    );
  }

  function isEscapeEvent(e) {
    return e.key === 'Escape' || e.key === 'Esc' || e.keyCode === 27;
  }

  function isTabEvent(e) {
    return e.key === 'Tab' || e.keyCode === 9;
  }

  function delay(fn) {
    return setTimeout(fn, 0);
  }

  var focusTrap_1 = focusTrap;

  /**
   * @license
   * Copyright 2016 Google Inc.
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in
   * all copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
   * THE SOFTWARE.
   */
  function createFocusTrapInstance(surfaceEl, focusTrapFactory) {
      if (focusTrapFactory === void 0) { focusTrapFactory = focusTrap_1; }
      return focusTrapFactory(surfaceEl, {
          clickOutsideDeactivates: true,
          escapeDeactivates: false,
          initialFocus: undefined,
          returnFocusOnDeactivate: false,
      });
  }
  //# sourceMappingURL=util.js.map

  /**
   * @license
   * Copyright 2018 Google Inc.
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in
   * all copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
   * THE SOFTWARE.
   */
  var cssClasses$3 = {
      LIST_ITEM_ACTIVATED_CLASS: 'mdc-list-item--activated',
      LIST_ITEM_CLASS: 'mdc-list-item',
      LIST_ITEM_DISABLED_CLASS: 'mdc-list-item--disabled',
      LIST_ITEM_SELECTED_CLASS: 'mdc-list-item--selected',
      ROOT: 'mdc-list',
  };
  var strings$4 = {
      ACTION_EVENT: 'MDCList:action',
      ARIA_CHECKED: 'aria-checked',
      ARIA_CHECKED_CHECKBOX_SELECTOR: '[role="checkbox"][aria-checked="true"]',
      ARIA_CHECKED_RADIO_SELECTOR: '[role="radio"][aria-checked="true"]',
      ARIA_CURRENT: 'aria-current',
      ARIA_DISABLED: 'aria-disabled',
      ARIA_ORIENTATION: 'aria-orientation',
      ARIA_ORIENTATION_HORIZONTAL: 'horizontal',
      ARIA_ROLE_CHECKBOX_SELECTOR: '[role="checkbox"]',
      ARIA_SELECTED: 'aria-selected',
      CHECKBOX_RADIO_SELECTOR: 'input[type="checkbox"]:not(:disabled), input[type="radio"]:not(:disabled)',
      CHECKBOX_SELECTOR: 'input[type="checkbox"]:not(:disabled)',
      CHILD_ELEMENTS_TO_TOGGLE_TABINDEX: "\n    ." + cssClasses$3.LIST_ITEM_CLASS + " button:not(:disabled),\n    ." + cssClasses$3.LIST_ITEM_CLASS + " a\n  ",
      FOCUSABLE_CHILD_ELEMENTS: "\n    ." + cssClasses$3.LIST_ITEM_CLASS + " button:not(:disabled),\n    ." + cssClasses$3.LIST_ITEM_CLASS + " a,\n    ." + cssClasses$3.LIST_ITEM_CLASS + " input[type=\"radio\"]:not(:disabled),\n    ." + cssClasses$3.LIST_ITEM_CLASS + " input[type=\"checkbox\"]:not(:disabled)\n  ",
      RADIO_SELECTOR: 'input[type="radio"]:not(:disabled)',
  };
  var numbers$2 = {
      UNSET_INDEX: -1,
  };
  //# sourceMappingURL=constants.js.map

  /**
   * @license
   * Copyright 2018 Google Inc.
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in
   * all copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
   * THE SOFTWARE.
   */
  var ELEMENTS_KEY_ALLOWED_IN = ['input', 'button', 'textarea', 'select'];
  function isNumberArray(selectedIndex) {
      return selectedIndex instanceof Array;
  }
  var MDCListFoundation = /** @class */ (function (_super) {
      __extends(MDCListFoundation, _super);
      function MDCListFoundation(adapter) {
          var _this = _super.call(this, __assign({}, MDCListFoundation.defaultAdapter, adapter)) || this;
          _this.wrapFocus_ = false;
          _this.isVertical_ = true;
          _this.isSingleSelectionList_ = false;
          _this.selectedIndex_ = numbers$2.UNSET_INDEX;
          _this.focusedItemIndex_ = numbers$2.UNSET_INDEX;
          _this.useActivatedClass_ = false;
          _this.ariaCurrentAttrValue_ = null;
          _this.isCheckboxList_ = false;
          _this.isRadioList_ = false;
          return _this;
      }
      Object.defineProperty(MDCListFoundation, "strings", {
          get: function () {
              return strings$4;
          },
          enumerable: true,
          configurable: true
      });
      Object.defineProperty(MDCListFoundation, "cssClasses", {
          get: function () {
              return cssClasses$3;
          },
          enumerable: true,
          configurable: true
      });
      Object.defineProperty(MDCListFoundation, "numbers", {
          get: function () {
              return numbers$2;
          },
          enumerable: true,
          configurable: true
      });
      Object.defineProperty(MDCListFoundation, "defaultAdapter", {
          get: function () {
              return {
                  addClassForElementIndex: function () { return undefined; },
                  focusItemAtIndex: function () { return undefined; },
                  getAttributeForElementIndex: function () { return null; },
                  getFocusedElementIndex: function () { return 0; },
                  getListItemCount: function () { return 0; },
                  hasCheckboxAtIndex: function () { return false; },
                  hasRadioAtIndex: function () { return false; },
                  isCheckboxCheckedAtIndex: function () { return false; },
                  isFocusInsideList: function () { return false; },
                  isRootFocused: function () { return false; },
                  notifyAction: function () { return undefined; },
                  removeClassForElementIndex: function () { return undefined; },
                  setAttributeForElementIndex: function () { return undefined; },
                  setCheckedCheckboxOrRadioAtIndex: function () { return undefined; },
                  setTabIndexForListItemChildren: function () { return undefined; },
              };
          },
          enumerable: true,
          configurable: true
      });
      MDCListFoundation.prototype.layout = function () {
          if (this.adapter_.getListItemCount() === 0) {
              return;
          }
          if (this.adapter_.hasCheckboxAtIndex(0)) {
              this.isCheckboxList_ = true;
          }
          else if (this.adapter_.hasRadioAtIndex(0)) {
              this.isRadioList_ = true;
          }
      };
      /**
       * Sets the private wrapFocus_ variable.
       */
      MDCListFoundation.prototype.setWrapFocus = function (value) {
          this.wrapFocus_ = value;
      };
      /**
       * Sets the isVertical_ private variable.
       */
      MDCListFoundation.prototype.setVerticalOrientation = function (value) {
          this.isVertical_ = value;
      };
      /**
       * Sets the isSingleSelectionList_ private variable.
       */
      MDCListFoundation.prototype.setSingleSelection = function (value) {
          this.isSingleSelectionList_ = value;
      };
      /**
       * Sets the useActivatedClass_ private variable.
       */
      MDCListFoundation.prototype.setUseActivatedClass = function (useActivated) {
          this.useActivatedClass_ = useActivated;
      };
      MDCListFoundation.prototype.getSelectedIndex = function () {
          return this.selectedIndex_;
      };
      MDCListFoundation.prototype.setSelectedIndex = function (index) {
          if (!this.isIndexValid_(index)) {
              return;
          }
          if (this.isCheckboxList_) {
              this.setCheckboxAtIndex_(index);
          }
          else if (this.isRadioList_) {
              this.setRadioAtIndex_(index);
          }
          else {
              this.setSingleSelectionAtIndex_(index);
          }
      };
      /**
       * Focus in handler for the list items.
       */
      MDCListFoundation.prototype.handleFocusIn = function (_, listItemIndex) {
          if (listItemIndex >= 0) {
              this.adapter_.setTabIndexForListItemChildren(listItemIndex, '0');
          }
      };
      /**
       * Focus out handler for the list items.
       */
      MDCListFoundation.prototype.handleFocusOut = function (_, listItemIndex) {
          var _this = this;
          if (listItemIndex >= 0) {
              this.adapter_.setTabIndexForListItemChildren(listItemIndex, '-1');
          }
          /**
           * Between Focusout & Focusin some browsers do not have focus on any element. Setting a delay to wait till the focus
           * is moved to next element.
           */
          setTimeout(function () {
              if (!_this.adapter_.isFocusInsideList()) {
                  _this.setTabindexToFirstSelectedItem_();
              }
          }, 0);
      };
      /**
       * Key handler for the list.
       */
      MDCListFoundation.prototype.handleKeydown = function (evt, isRootListItem, listItemIndex) {
          var isArrowLeft = evt.key === 'ArrowLeft' || evt.keyCode === 37;
          var isArrowUp = evt.key === 'ArrowUp' || evt.keyCode === 38;
          var isArrowRight = evt.key === 'ArrowRight' || evt.keyCode === 39;
          var isArrowDown = evt.key === 'ArrowDown' || evt.keyCode === 40;
          var isHome = evt.key === 'Home' || evt.keyCode === 36;
          var isEnd = evt.key === 'End' || evt.keyCode === 35;
          var isEnter = evt.key === 'Enter' || evt.keyCode === 13;
          var isSpace = evt.key === 'Space' || evt.keyCode === 32;
          if (this.adapter_.isRootFocused()) {
              if (isArrowUp || isEnd) {
                  evt.preventDefault();
                  this.focusLastElement();
              }
              else if (isArrowDown || isHome) {
                  evt.preventDefault();
                  this.focusFirstElement();
              }
              return;
          }
          var currentIndex = this.adapter_.getFocusedElementIndex();
          if (currentIndex === -1) {
              currentIndex = listItemIndex;
              if (currentIndex < 0) {
                  // If this event doesn't have a mdc-list-item ancestor from the
                  // current list (not from a sublist), return early.
                  return;
              }
          }
          var nextIndex;
          if ((this.isVertical_ && isArrowDown) || (!this.isVertical_ && isArrowRight)) {
              this.preventDefaultEvent_(evt);
              nextIndex = this.focusNextElement(currentIndex);
          }
          else if ((this.isVertical_ && isArrowUp) || (!this.isVertical_ && isArrowLeft)) {
              this.preventDefaultEvent_(evt);
              nextIndex = this.focusPrevElement(currentIndex);
          }
          else if (isHome) {
              this.preventDefaultEvent_(evt);
              nextIndex = this.focusFirstElement();
          }
          else if (isEnd) {
              this.preventDefaultEvent_(evt);
              nextIndex = this.focusLastElement();
          }
          else if (isEnter || isSpace) {
              if (isRootListItem) {
                  // Return early if enter key is pressed on anchor element which triggers synthetic MouseEvent event.
                  var target = evt.target;
                  if (target && target.tagName === 'A' && isEnter) {
                      return;
                  }
                  this.preventDefaultEvent_(evt);
                  if (this.isSelectableList_()) {
                      this.setSelectedIndexOnAction_(currentIndex);
                  }
                  this.adapter_.notifyAction(currentIndex);
              }
          }
          this.focusedItemIndex_ = currentIndex;
          if (nextIndex !== undefined) {
              this.setTabindexAtIndex_(nextIndex);
              this.focusedItemIndex_ = nextIndex;
          }
      };
      /**
       * Click handler for the list.
       */
      MDCListFoundation.prototype.handleClick = function (index, toggleCheckbox) {
          if (index === numbers$2.UNSET_INDEX) {
              return;
          }
          if (this.isSelectableList_()) {
              this.setSelectedIndexOnAction_(index, toggleCheckbox);
          }
          this.adapter_.notifyAction(index);
          this.setTabindexAtIndex_(index);
          this.focusedItemIndex_ = index;
      };
      /**
       * Focuses the next element on the list.
       */
      MDCListFoundation.prototype.focusNextElement = function (index) {
          var count = this.adapter_.getListItemCount();
          var nextIndex = index + 1;
          if (nextIndex >= count) {
              if (this.wrapFocus_) {
                  nextIndex = 0;
              }
              else {
                  // Return early because last item is already focused.
                  return index;
              }
          }
          this.adapter_.focusItemAtIndex(nextIndex);
          return nextIndex;
      };
      /**
       * Focuses the previous element on the list.
       */
      MDCListFoundation.prototype.focusPrevElement = function (index) {
          var prevIndex = index - 1;
          if (prevIndex < 0) {
              if (this.wrapFocus_) {
                  prevIndex = this.adapter_.getListItemCount() - 1;
              }
              else {
                  // Return early because first item is already focused.
                  return index;
              }
          }
          this.adapter_.focusItemAtIndex(prevIndex);
          return prevIndex;
      };
      MDCListFoundation.prototype.focusFirstElement = function () {
          this.adapter_.focusItemAtIndex(0);
          return 0;
      };
      MDCListFoundation.prototype.focusLastElement = function () {
          var lastIndex = this.adapter_.getListItemCount() - 1;
          this.adapter_.focusItemAtIndex(lastIndex);
          return lastIndex;
      };
      /**
       * @param itemIndex Index of the list item
       * @param isEnabled Sets the list item to enabled or disabled.
       */
      MDCListFoundation.prototype.setEnabled = function (itemIndex, isEnabled) {
          if (!this.isIndexValid_(itemIndex)) {
              return;
          }
          if (isEnabled) {
              this.adapter_.removeClassForElementIndex(itemIndex, cssClasses$3.LIST_ITEM_DISABLED_CLASS);
              this.adapter_.setAttributeForElementIndex(itemIndex, strings$4.ARIA_DISABLED, 'false');
          }
          else {
              this.adapter_.addClassForElementIndex(itemIndex, cssClasses$3.LIST_ITEM_DISABLED_CLASS);
              this.adapter_.setAttributeForElementIndex(itemIndex, strings$4.ARIA_DISABLED, 'true');
          }
      };
      /**
       * Ensures that preventDefault is only called if the containing element doesn't
       * consume the event, and it will cause an unintended scroll.
       */
      MDCListFoundation.prototype.preventDefaultEvent_ = function (evt) {
          var target = evt.target;
          var tagName = ("" + target.tagName).toLowerCase();
          if (ELEMENTS_KEY_ALLOWED_IN.indexOf(tagName) === -1) {
              evt.preventDefault();
          }
      };
      MDCListFoundation.prototype.setSingleSelectionAtIndex_ = function (index) {
          if (this.selectedIndex_ === index) {
              return;
          }
          var selectedClassName = cssClasses$3.LIST_ITEM_SELECTED_CLASS;
          if (this.useActivatedClass_) {
              selectedClassName = cssClasses$3.LIST_ITEM_ACTIVATED_CLASS;
          }
          if (this.selectedIndex_ !== numbers$2.UNSET_INDEX) {
              this.adapter_.removeClassForElementIndex(this.selectedIndex_, selectedClassName);
          }
          this.adapter_.addClassForElementIndex(index, selectedClassName);
          this.setAriaForSingleSelectionAtIndex_(index);
          this.selectedIndex_ = index;
      };
      /**
       * Sets aria attribute for single selection at given index.
       */
      MDCListFoundation.prototype.setAriaForSingleSelectionAtIndex_ = function (index) {
          // Detect the presence of aria-current and get the value only during list initialization when it is in unset state.
          if (this.selectedIndex_ === numbers$2.UNSET_INDEX) {
              this.ariaCurrentAttrValue_ =
                  this.adapter_.getAttributeForElementIndex(index, strings$4.ARIA_CURRENT);
          }
          var isAriaCurrent = this.ariaCurrentAttrValue_ !== null;
          var ariaAttribute = isAriaCurrent ? strings$4.ARIA_CURRENT : strings$4.ARIA_SELECTED;
          if (this.selectedIndex_ !== numbers$2.UNSET_INDEX) {
              this.adapter_.setAttributeForElementIndex(this.selectedIndex_, ariaAttribute, 'false');
          }
          var ariaAttributeValue = isAriaCurrent ? this.ariaCurrentAttrValue_ : 'true';
          this.adapter_.setAttributeForElementIndex(index, ariaAttribute, ariaAttributeValue);
      };
      /**
       * Toggles radio at give index. Radio doesn't change the checked state if it is already checked.
       */
      MDCListFoundation.prototype.setRadioAtIndex_ = function (index) {
          this.adapter_.setCheckedCheckboxOrRadioAtIndex(index, true);
          if (this.selectedIndex_ !== numbers$2.UNSET_INDEX) {
              this.adapter_.setAttributeForElementIndex(this.selectedIndex_, strings$4.ARIA_CHECKED, 'false');
          }
          this.adapter_.setAttributeForElementIndex(index, strings$4.ARIA_CHECKED, 'true');
          this.selectedIndex_ = index;
      };
      MDCListFoundation.prototype.setCheckboxAtIndex_ = function (index) {
          for (var i = 0; i < this.adapter_.getListItemCount(); i++) {
              var isChecked = false;
              if (index.indexOf(i) >= 0) {
                  isChecked = true;
              }
              this.adapter_.setCheckedCheckboxOrRadioAtIndex(i, isChecked);
              this.adapter_.setAttributeForElementIndex(i, strings$4.ARIA_CHECKED, isChecked ? 'true' : 'false');
          }
          this.selectedIndex_ = index;
      };
      MDCListFoundation.prototype.setTabindexAtIndex_ = function (index) {
          if (this.focusedItemIndex_ === numbers$2.UNSET_INDEX && index !== 0) {
              // If no list item was selected set first list item's tabindex to -1.
              // Generally, tabindex is set to 0 on first list item of list that has no preselected items.
              this.adapter_.setAttributeForElementIndex(0, 'tabindex', '-1');
          }
          else if (this.focusedItemIndex_ >= 0 && this.focusedItemIndex_ !== index) {
              this.adapter_.setAttributeForElementIndex(this.focusedItemIndex_, 'tabindex', '-1');
          }
          this.adapter_.setAttributeForElementIndex(index, 'tabindex', '0');
      };
      /**
       * @return Return true if it is single selectin list, checkbox list or radio list.
       */
      MDCListFoundation.prototype.isSelectableList_ = function () {
          return this.isSingleSelectionList_ || this.isCheckboxList_ || this.isRadioList_;
      };
      MDCListFoundation.prototype.setTabindexToFirstSelectedItem_ = function () {
          var targetIndex = 0;
          if (this.isSelectableList_()) {
              if (typeof this.selectedIndex_ === 'number' && this.selectedIndex_ !== numbers$2.UNSET_INDEX) {
                  targetIndex = this.selectedIndex_;
              }
              else if (isNumberArray(this.selectedIndex_) && this.selectedIndex_.length > 0) {
                  targetIndex = this.selectedIndex_.reduce(function (currentIndex, minIndex) { return Math.min(currentIndex, minIndex); });
              }
          }
          this.setTabindexAtIndex_(targetIndex);
      };
      MDCListFoundation.prototype.isIndexValid_ = function (index) {
          var _this = this;
          if (index instanceof Array) {
              if (!this.isCheckboxList_) {
                  throw new Error('MDCListFoundation: Array of index is only supported for checkbox based list');
              }
              if (index.length === 0) {
                  return true;
              }
              else {
                  return index.some(function (i) { return _this.isIndexInRange_(i); });
              }
          }
          else if (typeof index === 'number') {
              if (this.isCheckboxList_) {
                  throw new Error('MDCListFoundation: Expected array of index for checkbox based list but got number: ' + index);
              }
              return this.isIndexInRange_(index);
          }
          else {
              return false;
          }
      };
      MDCListFoundation.prototype.isIndexInRange_ = function (index) {
          var listSize = this.adapter_.getListItemCount();
          return index >= 0 && index < listSize;
      };
      MDCListFoundation.prototype.setSelectedIndexOnAction_ = function (index, toggleCheckbox) {
          if (toggleCheckbox === void 0) { toggleCheckbox = true; }
          if (this.isCheckboxList_) {
              this.toggleCheckboxAtIndex_(index, toggleCheckbox);
          }
          else {
              this.setSelectedIndex(index);
          }
      };
      MDCListFoundation.prototype.toggleCheckboxAtIndex_ = function (index, toggleCheckbox) {
          var isChecked = this.adapter_.isCheckboxCheckedAtIndex(index);
          if (toggleCheckbox) {
              isChecked = !isChecked;
              this.adapter_.setCheckedCheckboxOrRadioAtIndex(index, isChecked);
          }
          this.adapter_.setAttributeForElementIndex(index, strings$4.ARIA_CHECKED, isChecked ? 'true' : 'false');
          // If none of the checkbox items are selected and selectedIndex is not initialized then provide a default value.
          var selectedIndexes = this.selectedIndex_ === numbers$2.UNSET_INDEX ? [] : this.selectedIndex_.slice();
          if (isChecked) {
              selectedIndexes.push(index);
          }
          else {
              selectedIndexes = selectedIndexes.filter(function (i) { return i !== index; });
          }
          this.selectedIndex_ = selectedIndexes;
      };
      return MDCListFoundation;
  }(MDCFoundation));
  //# sourceMappingURL=foundation.js.map

  /**
   * @license
   * Copyright 2018 Google Inc.
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in
   * all copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
   * THE SOFTWARE.
   */
  var MDCList = /** @class */ (function (_super) {
      __extends(MDCList, _super);
      function MDCList() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      Object.defineProperty(MDCList.prototype, "vertical", {
          set: function (value) {
              this.foundation_.setVerticalOrientation(value);
          },
          enumerable: true,
          configurable: true
      });
      Object.defineProperty(MDCList.prototype, "listElements", {
          get: function () {
              return [].slice.call(this.root_.querySelectorAll("." + cssClasses$3.LIST_ITEM_CLASS));
          },
          enumerable: true,
          configurable: true
      });
      Object.defineProperty(MDCList.prototype, "wrapFocus", {
          set: function (value) {
              this.foundation_.setWrapFocus(value);
          },
          enumerable: true,
          configurable: true
      });
      Object.defineProperty(MDCList.prototype, "singleSelection", {
          set: function (isSingleSelectionList) {
              this.foundation_.setSingleSelection(isSingleSelectionList);
          },
          enumerable: true,
          configurable: true
      });
      Object.defineProperty(MDCList.prototype, "selectedIndex", {
          get: function () {
              return this.foundation_.getSelectedIndex();
          },
          set: function (index) {
              this.foundation_.setSelectedIndex(index);
          },
          enumerable: true,
          configurable: true
      });
      MDCList.attachTo = function (root) {
          return new MDCList(root);
      };
      MDCList.prototype.initialSyncWithDOM = function () {
          this.handleClick_ = this.handleClickEvent_.bind(this);
          this.handleKeydown_ = this.handleKeydownEvent_.bind(this);
          this.focusInEventListener_ = this.handleFocusInEvent_.bind(this);
          this.focusOutEventListener_ = this.handleFocusOutEvent_.bind(this);
          this.listen('keydown', this.handleKeydown_);
          this.listen('click', this.handleClick_);
          this.listen('focusin', this.focusInEventListener_);
          this.listen('focusout', this.focusOutEventListener_);
          this.layout();
          this.initializeListType();
      };
      MDCList.prototype.destroy = function () {
          this.unlisten('keydown', this.handleKeydown_);
          this.unlisten('click', this.handleClick_);
          this.unlisten('focusin', this.focusInEventListener_);
          this.unlisten('focusout', this.focusOutEventListener_);
      };
      MDCList.prototype.layout = function () {
          var direction = this.root_.getAttribute(strings$4.ARIA_ORIENTATION);
          this.vertical = direction !== strings$4.ARIA_ORIENTATION_HORIZONTAL;
          // List items need to have at least tabindex=-1 to be focusable.
          [].slice.call(this.root_.querySelectorAll('.mdc-list-item:not([tabindex])'))
              .forEach(function (el) {
              el.setAttribute('tabindex', '-1');
          });
          // Child button/a elements are not tabbable until the list item is focused.
          [].slice.call(this.root_.querySelectorAll(strings$4.FOCUSABLE_CHILD_ELEMENTS))
              .forEach(function (el) { return el.setAttribute('tabindex', '-1'); });
          this.foundation_.layout();
      };
      /**
       * Initialize selectedIndex value based on pre-selected checkbox list items, single selection or radio.
       */
      MDCList.prototype.initializeListType = function () {
          var _this = this;
          var checkboxListItems = this.root_.querySelectorAll(strings$4.ARIA_ROLE_CHECKBOX_SELECTOR);
          var singleSelectedListItem = this.root_.querySelector("\n      ." + cssClasses$3.LIST_ITEM_ACTIVATED_CLASS + ",\n      ." + cssClasses$3.LIST_ITEM_SELECTED_CLASS + "\n    ");
          var radioSelectedListItem = this.root_.querySelector(strings$4.ARIA_CHECKED_RADIO_SELECTOR);
          if (checkboxListItems.length) {
              var preselectedItems = this.root_.querySelectorAll(strings$4.ARIA_CHECKED_CHECKBOX_SELECTOR);
              this.selectedIndex =
                  [].map.call(preselectedItems, function (listItem) { return _this.listElements.indexOf(listItem); });
          }
          else if (singleSelectedListItem) {
              if (singleSelectedListItem.classList.contains(cssClasses$3.LIST_ITEM_ACTIVATED_CLASS)) {
                  this.foundation_.setUseActivatedClass(true);
              }
              this.singleSelection = true;
              this.selectedIndex = this.listElements.indexOf(singleSelectedListItem);
          }
          else if (radioSelectedListItem) {
              this.selectedIndex = this.listElements.indexOf(radioSelectedListItem);
          }
      };
      /**
       * Updates the list item at itemIndex to the desired isEnabled state.
       * @param itemIndex Index of the list item
       * @param isEnabled Sets the list item to enabled or disabled.
       */
      MDCList.prototype.setEnabled = function (itemIndex, isEnabled) {
          this.foundation_.setEnabled(itemIndex, isEnabled);
      };
      MDCList.prototype.getDefaultFoundation = function () {
          var _this = this;
          // DO NOT INLINE this variable. For backward compatibility, foundations take a Partial<MDCFooAdapter>.
          // To ensure we don't accidentally omit any methods, we need a separate, strongly typed adapter variable.
          var adapter = {
              addClassForElementIndex: function (index, className) {
                  var element = _this.listElements[index];
                  if (element) {
                      element.classList.add(className);
                  }
              },
              focusItemAtIndex: function (index) {
                  var element = _this.listElements[index];
                  if (element) {
                      element.focus();
                  }
              },
              getAttributeForElementIndex: function (index, attr) { return _this.listElements[index].getAttribute(attr); },
              getFocusedElementIndex: function () { return _this.listElements.indexOf(document.activeElement); },
              getListItemCount: function () { return _this.listElements.length; },
              hasCheckboxAtIndex: function (index) {
                  var listItem = _this.listElements[index];
                  return !!listItem.querySelector(strings$4.CHECKBOX_SELECTOR);
              },
              hasRadioAtIndex: function (index) {
                  var listItem = _this.listElements[index];
                  return !!listItem.querySelector(strings$4.RADIO_SELECTOR);
              },
              isCheckboxCheckedAtIndex: function (index) {
                  var listItem = _this.listElements[index];
                  var toggleEl = listItem.querySelector(strings$4.CHECKBOX_SELECTOR);
                  return toggleEl.checked;
              },
              isFocusInsideList: function () {
                  return _this.root_.contains(document.activeElement);
              },
              isRootFocused: function () { return document.activeElement === _this.root_; },
              notifyAction: function (index) {
                  _this.emit(strings$4.ACTION_EVENT, { index: index }, /** shouldBubble */ true);
              },
              removeClassForElementIndex: function (index, className) {
                  var element = _this.listElements[index];
                  if (element) {
                      element.classList.remove(className);
                  }
              },
              setAttributeForElementIndex: function (index, attr, value) {
                  var element = _this.listElements[index];
                  if (element) {
                      element.setAttribute(attr, value);
                  }
              },
              setCheckedCheckboxOrRadioAtIndex: function (index, isChecked) {
                  var listItem = _this.listElements[index];
                  var toggleEl = listItem.querySelector(strings$4.CHECKBOX_RADIO_SELECTOR);
                  toggleEl.checked = isChecked;
                  var event = document.createEvent('Event');
                  event.initEvent('change', true, true);
                  toggleEl.dispatchEvent(event);
              },
              setTabIndexForListItemChildren: function (listItemIndex, tabIndexValue) {
                  var element = _this.listElements[listItemIndex];
                  var listItemChildren = [].slice.call(element.querySelectorAll(strings$4.CHILD_ELEMENTS_TO_TOGGLE_TABINDEX));
                  listItemChildren.forEach(function (el) { return el.setAttribute('tabindex', tabIndexValue); });
              },
          };
          return new MDCListFoundation(adapter);
      };
      /**
       * Used to figure out which list item this event is targetting. Or returns -1 if
       * there is no list item
       */
      MDCList.prototype.getListItemIndex_ = function (evt) {
          var eventTarget = evt.target;
          var nearestParent = closest(eventTarget, "." + cssClasses$3.LIST_ITEM_CLASS + ", ." + cssClasses$3.ROOT);
          // Get the index of the element if it is a list item.
          if (nearestParent && matches(nearestParent, "." + cssClasses$3.LIST_ITEM_CLASS)) {
              return this.listElements.indexOf(nearestParent);
          }
          return -1;
      };
      /**
       * Used to figure out which element was clicked before sending the event to the foundation.
       */
      MDCList.prototype.handleFocusInEvent_ = function (evt) {
          var index = this.getListItemIndex_(evt);
          this.foundation_.handleFocusIn(evt, index);
      };
      /**
       * Used to figure out which element was clicked before sending the event to the foundation.
       */
      MDCList.prototype.handleFocusOutEvent_ = function (evt) {
          var index = this.getListItemIndex_(evt);
          this.foundation_.handleFocusOut(evt, index);
      };
      /**
       * Used to figure out which element was focused when keydown event occurred before sending the event to the
       * foundation.
       */
      MDCList.prototype.handleKeydownEvent_ = function (evt) {
          var index = this.getListItemIndex_(evt);
          var target = evt.target;
          this.foundation_.handleKeydown(evt, target.classList.contains(cssClasses$3.LIST_ITEM_CLASS), index);
      };
      /**
       * Used to figure out which element was clicked before sending the event to the foundation.
       */
      MDCList.prototype.handleClickEvent_ = function (evt) {
          var index = this.getListItemIndex_(evt);
          var target = evt.target;
          // Toggle the checkbox only if it's not the target of the event, or the checkbox will have 2 change events.
          var toggleCheckbox = !matches(target, strings$4.CHECKBOX_RADIO_SELECTOR);
          this.foundation_.handleClick(index, toggleCheckbox);
      };
      return MDCList;
  }(MDCComponent));
  //# sourceMappingURL=component.js.map

  /**
   * @license
   * Copyright 2016 Google Inc.
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in
   * all copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
   * THE SOFTWARE.
   */
  var cssClasses$4 = {
      ANIMATE: 'mdc-drawer--animate',
      CLOSING: 'mdc-drawer--closing',
      DISMISSIBLE: 'mdc-drawer--dismissible',
      MODAL: 'mdc-drawer--modal',
      OPEN: 'mdc-drawer--open',
      OPENING: 'mdc-drawer--opening',
      ROOT: 'mdc-drawer',
  };
  var strings$5 = {
      APP_CONTENT_SELECTOR: '.mdc-drawer-app-content',
      CLOSE_EVENT: 'MDCDrawer:closed',
      OPEN_EVENT: 'MDCDrawer:opened',
      SCRIM_SELECTOR: '.mdc-drawer-scrim',
  };
  //# sourceMappingURL=constants.js.map

  /**
   * @license
   * Copyright 2018 Google Inc.
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in
   * all copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
   * THE SOFTWARE.
   */
  var MDCDismissibleDrawerFoundation = /** @class */ (function (_super) {
      __extends(MDCDismissibleDrawerFoundation, _super);
      function MDCDismissibleDrawerFoundation(adapter) {
          var _this = _super.call(this, __assign({}, MDCDismissibleDrawerFoundation.defaultAdapter, adapter)) || this;
          _this.animationFrame_ = 0;
          _this.animationTimer_ = 0;
          return _this;
      }
      Object.defineProperty(MDCDismissibleDrawerFoundation, "strings", {
          get: function () {
              return strings$5;
          },
          enumerable: true,
          configurable: true
      });
      Object.defineProperty(MDCDismissibleDrawerFoundation, "cssClasses", {
          get: function () {
              return cssClasses$4;
          },
          enumerable: true,
          configurable: true
      });
      Object.defineProperty(MDCDismissibleDrawerFoundation, "defaultAdapter", {
          get: function () {
              // tslint:disable:object-literal-sort-keys Methods should be in the same order as the adapter interface.
              return {
                  addClass: function () { return undefined; },
                  removeClass: function () { return undefined; },
                  hasClass: function () { return false; },
                  elementHasClass: function () { return false; },
                  notifyClose: function () { return undefined; },
                  notifyOpen: function () { return undefined; },
                  saveFocus: function () { return undefined; },
                  restoreFocus: function () { return undefined; },
                  focusActiveNavigationItem: function () { return undefined; },
                  trapFocus: function () { return undefined; },
                  releaseFocus: function () { return undefined; },
              };
              // tslint:enable:object-literal-sort-keys
          },
          enumerable: true,
          configurable: true
      });
      MDCDismissibleDrawerFoundation.prototype.destroy = function () {
          if (this.animationFrame_) {
              cancelAnimationFrame(this.animationFrame_);
          }
          if (this.animationTimer_) {
              clearTimeout(this.animationTimer_);
          }
      };
      /**
       * Opens the drawer from the closed state.
       */
      MDCDismissibleDrawerFoundation.prototype.open = function () {
          var _this = this;
          if (this.isOpen() || this.isOpening() || this.isClosing()) {
              return;
          }
          this.adapter_.addClass(cssClasses$4.OPEN);
          this.adapter_.addClass(cssClasses$4.ANIMATE);
          // Wait a frame once display is no longer "none", to establish basis for animation
          this.runNextAnimationFrame_(function () {
              _this.adapter_.addClass(cssClasses$4.OPENING);
          });
          this.adapter_.saveFocus();
      };
      /**
       * Closes the drawer from the open state.
       */
      MDCDismissibleDrawerFoundation.prototype.close = function () {
          if (!this.isOpen() || this.isOpening() || this.isClosing()) {
              return;
          }
          this.adapter_.addClass(cssClasses$4.CLOSING);
      };
      /**
       * Returns true if the drawer is in the open position.
       * @return true if drawer is in open state.
       */
      MDCDismissibleDrawerFoundation.prototype.isOpen = function () {
          return this.adapter_.hasClass(cssClasses$4.OPEN);
      };
      /**
       * Returns true if the drawer is animating open.
       * @return true if drawer is animating open.
       */
      MDCDismissibleDrawerFoundation.prototype.isOpening = function () {
          return this.adapter_.hasClass(cssClasses$4.OPENING) || this.adapter_.hasClass(cssClasses$4.ANIMATE);
      };
      /**
       * Returns true if the drawer is animating closed.
       * @return true if drawer is animating closed.
       */
      MDCDismissibleDrawerFoundation.prototype.isClosing = function () {
          return this.adapter_.hasClass(cssClasses$4.CLOSING);
      };
      /**
       * Keydown handler to close drawer when key is escape.
       */
      MDCDismissibleDrawerFoundation.prototype.handleKeydown = function (evt) {
          var keyCode = evt.keyCode, key = evt.key;
          var isEscape = key === 'Escape' || keyCode === 27;
          if (isEscape) {
              this.close();
          }
      };
      /**
       * Handles the `transitionend` event when the drawer finishes opening/closing.
       */
      MDCDismissibleDrawerFoundation.prototype.handleTransitionEnd = function (evt) {
          var OPENING = cssClasses$4.OPENING, CLOSING = cssClasses$4.CLOSING, OPEN = cssClasses$4.OPEN, ANIMATE = cssClasses$4.ANIMATE, ROOT = cssClasses$4.ROOT;
          // In Edge, transitionend on ripple pseudo-elements yields a target without classList, so check for Element first.
          var isRootElement = this.isElement_(evt.target) && this.adapter_.elementHasClass(evt.target, ROOT);
          if (!isRootElement) {
              return;
          }
          if (this.isClosing()) {
              this.adapter_.removeClass(OPEN);
              this.closed_();
              this.adapter_.restoreFocus();
              this.adapter_.notifyClose();
          }
          else {
              this.adapter_.focusActiveNavigationItem();
              this.opened_();
              this.adapter_.notifyOpen();
          }
          this.adapter_.removeClass(ANIMATE);
          this.adapter_.removeClass(OPENING);
          this.adapter_.removeClass(CLOSING);
      };
      /**
       * Extension point for when drawer finishes open animation.
       */
      MDCDismissibleDrawerFoundation.prototype.opened_ = function () { }; // tslint:disable-line:no-empty
      /**
       * Extension point for when drawer finishes close animation.
       */
      MDCDismissibleDrawerFoundation.prototype.closed_ = function () { }; // tslint:disable-line:no-empty
      /**
       * Runs the given logic on the next animation frame, using setTimeout to factor in Firefox reflow behavior.
       */
      MDCDismissibleDrawerFoundation.prototype.runNextAnimationFrame_ = function (callback) {
          var _this = this;
          cancelAnimationFrame(this.animationFrame_);
          this.animationFrame_ = requestAnimationFrame(function () {
              _this.animationFrame_ = 0;
              clearTimeout(_this.animationTimer_);
              _this.animationTimer_ = setTimeout(callback, 0);
          });
      };
      MDCDismissibleDrawerFoundation.prototype.isElement_ = function (element) {
          // In Edge, transitionend on ripple pseudo-elements yields a target without classList.
          return Boolean(element.classList);
      };
      return MDCDismissibleDrawerFoundation;
  }(MDCFoundation));
  //# sourceMappingURL=foundation.js.map

  /**
   * @license
   * Copyright 2018 Google Inc.
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in
   * all copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
   * THE SOFTWARE.
   */
  /* istanbul ignore next: subclass is not a branch statement */
  var MDCModalDrawerFoundation = /** @class */ (function (_super) {
      __extends(MDCModalDrawerFoundation, _super);
      function MDCModalDrawerFoundation() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      /**
       * Handles click event on scrim.
       */
      MDCModalDrawerFoundation.prototype.handleScrimClick = function () {
          this.close();
      };
      /**
       * Called when drawer finishes open animation.
       */
      MDCModalDrawerFoundation.prototype.opened_ = function () {
          this.adapter_.trapFocus();
      };
      /**
       * Called when drawer finishes close animation.
       */
      MDCModalDrawerFoundation.prototype.closed_ = function () {
          this.adapter_.releaseFocus();
      };
      return MDCModalDrawerFoundation;
  }(MDCDismissibleDrawerFoundation));
  //# sourceMappingURL=foundation.js.map

  /**
   * @license
   * Copyright 2016 Google Inc.
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in
   * all copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
   * THE SOFTWARE.
   */
  var cssClasses$5 = MDCDismissibleDrawerFoundation.cssClasses, strings$6 = MDCDismissibleDrawerFoundation.strings;
  /**
   * @events `MDCDrawer:closed {}` Emits when the navigation drawer has closed.
   * @events `MDCDrawer:opened {}` Emits when the navigation drawer has opened.
   */
  var MDCDrawer = /** @class */ (function (_super) {
      __extends(MDCDrawer, _super);
      function MDCDrawer() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      MDCDrawer.attachTo = function (root) {
          return new MDCDrawer(root);
      };
      Object.defineProperty(MDCDrawer.prototype, "open", {
          /**
           * @return boolean Proxies to the foundation's `open`/`close` methods.
           * Also returns true if drawer is in the open position.
           */
          get: function () {
              return this.foundation_.isOpen();
          },
          /**
           * Toggles the drawer open and closed.
           */
          set: function (isOpen) {
              if (isOpen) {
                  this.foundation_.open();
              }
              else {
                  this.foundation_.close();
              }
          },
          enumerable: true,
          configurable: true
      });
      Object.defineProperty(MDCDrawer.prototype, "list", {
          get: function () {
              return this.list_;
          },
          enumerable: true,
          configurable: true
      });
      MDCDrawer.prototype.initialize = function (focusTrapFactory, listFactory) {
          if (focusTrapFactory === void 0) { focusTrapFactory = focusTrap_1; }
          if (listFactory === void 0) { listFactory = function (el) { return new MDCList(el); }; }
          var listEl = this.root_.querySelector("." + MDCListFoundation.cssClasses.ROOT);
          if (listEl) {
              this.list_ = listFactory(listEl);
              this.list_.wrapFocus = true;
          }
          this.focusTrapFactory_ = focusTrapFactory;
      };
      MDCDrawer.prototype.initialSyncWithDOM = function () {
          var _this = this;
          var MODAL = cssClasses$5.MODAL;
          var SCRIM_SELECTOR = strings$6.SCRIM_SELECTOR;
          this.scrim_ = this.root_.parentNode.querySelector(SCRIM_SELECTOR);
          if (this.scrim_ && this.root_.classList.contains(MODAL)) {
              this.handleScrimClick_ = function () { return _this.foundation_.handleScrimClick(); };
              this.scrim_.addEventListener('click', this.handleScrimClick_);
              this.focusTrap_ = createFocusTrapInstance(this.root_, this.focusTrapFactory_);
          }
          this.handleKeydown_ = function (evt) { return _this.foundation_.handleKeydown(evt); };
          this.handleTransitionEnd_ = function (evt) { return _this.foundation_.handleTransitionEnd(evt); };
          this.listen('keydown', this.handleKeydown_);
          this.listen('transitionend', this.handleTransitionEnd_);
      };
      MDCDrawer.prototype.destroy = function () {
          this.unlisten('keydown', this.handleKeydown_);
          this.unlisten('transitionend', this.handleTransitionEnd_);
          if (this.list_) {
              this.list_.destroy();
          }
          var MODAL = cssClasses$5.MODAL;
          if (this.scrim_ && this.handleScrimClick_ && this.root_.classList.contains(MODAL)) {
              this.scrim_.removeEventListener('click', this.handleScrimClick_);
              // Ensure drawer is closed to hide scrim and release focus
              this.open = false;
          }
      };
      MDCDrawer.prototype.getDefaultFoundation = function () {
          var _this = this;
          // DO NOT INLINE this variable. For backward compatibility, foundations take a Partial<MDCFooAdapter>.
          // To ensure we don't accidentally omit any methods, we need a separate, strongly typed adapter variable.
          // tslint:disable:object-literal-sort-keys Methods should be in the same order as the adapter interface.
          var adapter = {
              addClass: function (className) { return _this.root_.classList.add(className); },
              removeClass: function (className) { return _this.root_.classList.remove(className); },
              hasClass: function (className) { return _this.root_.classList.contains(className); },
              elementHasClass: function (element, className) { return element.classList.contains(className); },
              saveFocus: function () { return _this.previousFocus_ = document.activeElement; },
              restoreFocus: function () {
                  var previousFocus = _this.previousFocus_;
                  if (previousFocus && previousFocus.focus && _this.root_.contains(document.activeElement)) {
                      previousFocus.focus();
                  }
              },
              focusActiveNavigationItem: function () {
                  var activeNavItemEl = _this.root_.querySelector("." + MDCListFoundation.cssClasses.LIST_ITEM_ACTIVATED_CLASS);
                  if (activeNavItemEl) {
                      activeNavItemEl.focus();
                  }
              },
              notifyClose: function () { return _this.emit(strings$6.CLOSE_EVENT, {}, true /* shouldBubble */); },
              notifyOpen: function () { return _this.emit(strings$6.OPEN_EVENT, {}, true /* shouldBubble */); },
              trapFocus: function () { return _this.focusTrap_.activate(); },
              releaseFocus: function () { return _this.focusTrap_.deactivate(); },
          };
          // tslint:enable:object-literal-sort-keys
          var DISMISSIBLE = cssClasses$5.DISMISSIBLE, MODAL = cssClasses$5.MODAL;
          if (this.root_.classList.contains(DISMISSIBLE)) {
              return new MDCDismissibleDrawerFoundation(adapter);
          }
          else if (this.root_.classList.contains(MODAL)) {
              return new MDCModalDrawerFoundation(adapter);
          }
          else {
              throw new Error("MDCDrawer: Failed to instantiate component. Supported variants are " + DISMISSIBLE + " and " + MODAL + ".");
          }
      };
      return MDCDrawer;
  }(MDCComponent));
  //# sourceMappingURL=component.js.map

  /* node_modules/@smui/drawer/Drawer.svelte generated by Svelte v3.18.1 */

  function create_fragment$9(ctx) {
  	let aside;
  	let useActions_action;
  	let forwardEvents_action;
  	let current;
  	let dispose;
  	const default_slot_template = /*$$slots*/ ctx[14].default;
  	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[13], null);

  	let aside_levels = [
  		{
  			class: "\n    mdc-drawer\n    " + /*className*/ ctx[1] + "\n    " + (/*variant*/ ctx[2] === "dismissible"
  			? "mdc-drawer--dismissible"
  			: "") + "\n    " + (/*variant*/ ctx[2] === "modal"
  			? "mdc-drawer--modal"
  			: "") + "\n  "
  		},
  		exclude(/*$$props*/ ctx[6], ["use", "class", "variant", "open"])
  	];

  	let aside_data = {};

  	for (let i = 0; i < aside_levels.length; i += 1) {
  		aside_data = assign(aside_data, aside_levels[i]);
  	}

  	return {
  		c() {
  			aside = element("aside");
  			if (default_slot) default_slot.c();
  			set_attributes(aside, aside_data);
  		},
  		m(target, anchor) {
  			insert(target, aside, anchor);

  			if (default_slot) {
  				default_slot.m(aside, null);
  			}

  			/*aside_binding*/ ctx[15](aside);
  			current = true;

  			dispose = [
  				action_destroyer(useActions_action = useActions.call(null, aside, /*use*/ ctx[0])),
  				action_destroyer(forwardEvents_action = /*forwardEvents*/ ctx[4].call(null, aside)),
  				listen(aside, "MDCDrawer:opened", /*updateOpen*/ ctx[5]),
  				listen(aside, "MDCDrawer:closed", /*updateOpen*/ ctx[5])
  			];
  		},
  		p(ctx, [dirty]) {
  			if (default_slot && default_slot.p && dirty & /*$$scope*/ 8192) {
  				default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[13], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[13], dirty, null));
  			}

  			set_attributes(aside, get_spread_update(aside_levels, [
  				dirty & /*className, variant*/ 6 && {
  					class: "\n    mdc-drawer\n    " + /*className*/ ctx[1] + "\n    " + (/*variant*/ ctx[2] === "dismissible"
  					? "mdc-drawer--dismissible"
  					: "") + "\n    " + (/*variant*/ ctx[2] === "modal"
  					? "mdc-drawer--modal"
  					: "") + "\n  "
  				},
  				dirty & /*exclude, $$props*/ 64 && exclude(/*$$props*/ ctx[6], ["use", "class", "variant", "open"])
  			]));

  			if (useActions_action && is_function(useActions_action.update) && dirty & /*use*/ 1) useActions_action.update.call(null, /*use*/ ctx[0]);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(default_slot, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(default_slot, local);
  			current = false;
  		},
  		d(detaching) {
  			if (detaching) detach(aside);
  			if (default_slot) default_slot.d(detaching);
  			/*aside_binding*/ ctx[15](null);
  			run_all(dispose);
  		}
  	};
  }

  function instance$9($$self, $$props, $$invalidate) {
  	const forwardEvents = forwardEventsBuilder(current_component, ["MDCDrawer:opened", "MDCDrawer:closed"]);
  	let { use = [] } = $$props;
  	let { class: className = "" } = $$props;
  	let { variant = null } = $$props;
  	let { open = false } = $$props;
  	let element;
  	let drawer;
  	let listPromiseResolve;
  	let listPromise = new Promise(resolve => listPromiseResolve = resolve);
  	setContext("SMUI:list:nav", true);
  	setContext("SMUI:list:item:nav", true);

  	if (variant === "dismissible" || variant === "modal") {
  		setContext("SMUI:list:instantiate", false);
  		setContext("SMUI:list:getInstance", getListInstancePromise);
  	}

  	onMount(() => {
  		if (variant === "dismissible" || variant === "modal") {
  			$$invalidate(9, drawer = new MDCDrawer(element));
  			listPromiseResolve(drawer.list_);
  		}
  	});

  	onDestroy(() => {
  		drawer && drawer.destroy();
  	});

  	afterUpdate(() => {
  		if (drawer && !(variant === "dismissible" || variant === "modal")) {
  			drawer.destroy();
  			$$invalidate(9, drawer = undefined);
  		} else if (!drawer && (variant === "dismissible" || variant === "modal")) {
  			$$invalidate(9, drawer = new MDCDrawer(element));
  			listPromiseResolve(drawer.list_);
  		}
  	});

  	function getListInstancePromise() {
  		return listPromise;
  	}

  	function updateOpen() {
  		$$invalidate(7, open = drawer.open);
  	}

  	function setOpen(value) {
  		$$invalidate(7, open = value);
  	}

  	let { $$slots = {}, $$scope } = $$props;

  	function aside_binding($$value) {
  		binding_callbacks[$$value ? "unshift" : "push"](() => {
  			$$invalidate(3, element = $$value);
  		});
  	}

  	$$self.$set = $$new_props => {
  		$$invalidate(6, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
  		if ("use" in $$new_props) $$invalidate(0, use = $$new_props.use);
  		if ("class" in $$new_props) $$invalidate(1, className = $$new_props.class);
  		if ("variant" in $$new_props) $$invalidate(2, variant = $$new_props.variant);
  		if ("open" in $$new_props) $$invalidate(7, open = $$new_props.open);
  		if ("$$scope" in $$new_props) $$invalidate(13, $$scope = $$new_props.$$scope);
  	};

  	$$self.$$.update = () => {
  		if ($$self.$$.dirty & /*drawer, open*/ 640) {
  			 if (drawer && drawer.open !== open) {
  				$$invalidate(9, drawer.open = open, drawer);
  			}
  		}
  	};

  	$$props = exclude_internal_props($$props);

  	return [
  		use,
  		className,
  		variant,
  		element,
  		forwardEvents,
  		updateOpen,
  		$$props,
  		open,
  		setOpen,
  		drawer,
  		listPromiseResolve,
  		listPromise,
  		getListInstancePromise,
  		$$scope,
  		$$slots,
  		aside_binding
  	];
  }

  class Drawer extends SvelteComponent {
  	constructor(options) {
  		super();

  		init(this, options, instance$9, create_fragment$9, safe_not_equal, {
  			use: 0,
  			class: 1,
  			variant: 2,
  			open: 7,
  			setOpen: 8
  		});
  	}

  	get setOpen() {
  		return this.$$.ctx[8];
  	}
  }

  classAdderBuilder({
    class: 'mdc-drawer-app-content',
    component: Div,
    contexts: {}
  });

  var Content = classAdderBuilder({
    class: 'mdc-drawer__content',
    component: Div,
    contexts: {}
  });

  var Header = classAdderBuilder({
    class: 'mdc-drawer__header',
    component: Div,
    contexts: {}
  });

  /* node_modules/@smui/common/H1.svelte generated by Svelte v3.18.1 */

  function create_fragment$a(ctx) {
  	let h1;
  	let useActions_action;
  	let forwardEvents_action;
  	let current;
  	let dispose;
  	const default_slot_template = /*$$slots*/ ctx[4].default;
  	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[3], null);
  	let h1_levels = [exclude(/*$$props*/ ctx[2], ["use"])];
  	let h1_data = {};

  	for (let i = 0; i < h1_levels.length; i += 1) {
  		h1_data = assign(h1_data, h1_levels[i]);
  	}

  	return {
  		c() {
  			h1 = element("h1");
  			if (default_slot) default_slot.c();
  			set_attributes(h1, h1_data);
  		},
  		m(target, anchor) {
  			insert(target, h1, anchor);

  			if (default_slot) {
  				default_slot.m(h1, null);
  			}

  			current = true;

  			dispose = [
  				action_destroyer(useActions_action = useActions.call(null, h1, /*use*/ ctx[0])),
  				action_destroyer(forwardEvents_action = /*forwardEvents*/ ctx[1].call(null, h1))
  			];
  		},
  		p(ctx, [dirty]) {
  			if (default_slot && default_slot.p && dirty & /*$$scope*/ 8) {
  				default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[3], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[3], dirty, null));
  			}

  			set_attributes(h1, get_spread_update(h1_levels, [dirty & /*exclude, $$props*/ 4 && exclude(/*$$props*/ ctx[2], ["use"])]));
  			if (useActions_action && is_function(useActions_action.update) && dirty & /*use*/ 1) useActions_action.update.call(null, /*use*/ ctx[0]);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(default_slot, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(default_slot, local);
  			current = false;
  		},
  		d(detaching) {
  			if (detaching) detach(h1);
  			if (default_slot) default_slot.d(detaching);
  			run_all(dispose);
  		}
  	};
  }

  function instance$a($$self, $$props, $$invalidate) {
  	const forwardEvents = forwardEventsBuilder(current_component);
  	let { use = [] } = $$props;
  	let { $$slots = {}, $$scope } = $$props;

  	$$self.$set = $$new_props => {
  		$$invalidate(2, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
  		if ("use" in $$new_props) $$invalidate(0, use = $$new_props.use);
  		if ("$$scope" in $$new_props) $$invalidate(3, $$scope = $$new_props.$$scope);
  	};

  	$$props = exclude_internal_props($$props);
  	return [use, forwardEvents, $$props, $$scope, $$slots];
  }

  class H1 extends SvelteComponent {
  	constructor(options) {
  		super();
  		init(this, options, instance$a, create_fragment$a, safe_not_equal, { use: 0 });
  	}
  }

  classAdderBuilder({
    class: 'mdc-drawer__title',
    component: H1,
    contexts: {}
  });

  /* node_modules/@smui/common/H2.svelte generated by Svelte v3.18.1 */

  function create_fragment$b(ctx) {
  	let h2;
  	let useActions_action;
  	let forwardEvents_action;
  	let current;
  	let dispose;
  	const default_slot_template = /*$$slots*/ ctx[4].default;
  	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[3], null);
  	let h2_levels = [exclude(/*$$props*/ ctx[2], ["use"])];
  	let h2_data = {};

  	for (let i = 0; i < h2_levels.length; i += 1) {
  		h2_data = assign(h2_data, h2_levels[i]);
  	}

  	return {
  		c() {
  			h2 = element("h2");
  			if (default_slot) default_slot.c();
  			set_attributes(h2, h2_data);
  		},
  		m(target, anchor) {
  			insert(target, h2, anchor);

  			if (default_slot) {
  				default_slot.m(h2, null);
  			}

  			current = true;

  			dispose = [
  				action_destroyer(useActions_action = useActions.call(null, h2, /*use*/ ctx[0])),
  				action_destroyer(forwardEvents_action = /*forwardEvents*/ ctx[1].call(null, h2))
  			];
  		},
  		p(ctx, [dirty]) {
  			if (default_slot && default_slot.p && dirty & /*$$scope*/ 8) {
  				default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[3], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[3], dirty, null));
  			}

  			set_attributes(h2, get_spread_update(h2_levels, [dirty & /*exclude, $$props*/ 4 && exclude(/*$$props*/ ctx[2], ["use"])]));
  			if (useActions_action && is_function(useActions_action.update) && dirty & /*use*/ 1) useActions_action.update.call(null, /*use*/ ctx[0]);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(default_slot, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(default_slot, local);
  			current = false;
  		},
  		d(detaching) {
  			if (detaching) detach(h2);
  			if (default_slot) default_slot.d(detaching);
  			run_all(dispose);
  		}
  	};
  }

  function instance$b($$self, $$props, $$invalidate) {
  	const forwardEvents = forwardEventsBuilder(current_component);
  	let { use = [] } = $$props;
  	let { $$slots = {}, $$scope } = $$props;

  	$$self.$set = $$new_props => {
  		$$invalidate(2, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
  		if ("use" in $$new_props) $$invalidate(0, use = $$new_props.use);
  		if ("$$scope" in $$new_props) $$invalidate(3, $$scope = $$new_props.$$scope);
  	};

  	$$props = exclude_internal_props($$props);
  	return [use, forwardEvents, $$props, $$scope, $$slots];
  }

  class H2 extends SvelteComponent {
  	constructor(options) {
  		super();
  		init(this, options, instance$b, create_fragment$b, safe_not_equal, { use: 0 });
  	}
  }

  var Subtitle = classAdderBuilder({
    class: 'mdc-drawer__subtitle',
    component: H2,
    contexts: {}
  });

  classAdderBuilder({
    class: 'mdc-drawer-scrim',
    component: Div,
    contexts: {}
  });

  /* node_modules/@smui/list/List.svelte generated by Svelte v3.18.1 */

  function create_else_block$1(ctx) {
  	let ul;
  	let useActions_action;
  	let forwardEvents_action;
  	let current;
  	let dispose;
  	const default_slot_template = /*$$slots*/ ctx[29].default;
  	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[28], null);

  	let ul_levels = [
  		{
  			class: "\n      mdc-list\n      " + /*className*/ ctx[1] + "\n      " + (/*nonInteractive*/ ctx[2]
  			? "mdc-list--non-interactive"
  			: "") + "\n      " + (/*dense*/ ctx[3] ? "mdc-list--dense" : "") + "\n      " + (/*avatarList*/ ctx[4] ? "mdc-list--avatar-list" : "") + "\n      " + (/*twoLine*/ ctx[5] ? "mdc-list--two-line" : "") + "\n      " + (/*threeLine*/ ctx[6] && !/*twoLine*/ ctx[5]
  			? "smui-list--three-line"
  			: "") + "\n    "
  		},
  		{ role: /*role*/ ctx[8] },
  		/*props*/ ctx[9]
  	];

  	let ul_data = {};

  	for (let i = 0; i < ul_levels.length; i += 1) {
  		ul_data = assign(ul_data, ul_levels[i]);
  	}

  	return {
  		c() {
  			ul = element("ul");
  			if (default_slot) default_slot.c();
  			set_attributes(ul, ul_data);
  		},
  		m(target, anchor) {
  			insert(target, ul, anchor);

  			if (default_slot) {
  				default_slot.m(ul, null);
  			}

  			/*ul_binding*/ ctx[31](ul);
  			current = true;

  			dispose = [
  				action_destroyer(useActions_action = useActions.call(null, ul, /*use*/ ctx[0])),
  				action_destroyer(forwardEvents_action = /*forwardEvents*/ ctx[10].call(null, ul)),
  				listen(ul, "MDCList:action", /*handleAction*/ ctx[12])
  			];
  		},
  		p(ctx, dirty) {
  			if (default_slot && default_slot.p && dirty[0] & /*$$scope*/ 268435456) {
  				default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[28], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[28], dirty, null));
  			}

  			set_attributes(ul, get_spread_update(ul_levels, [
  				dirty[0] & /*className, nonInteractive, dense, avatarList, twoLine, threeLine*/ 126 && {
  					class: "\n      mdc-list\n      " + /*className*/ ctx[1] + "\n      " + (/*nonInteractive*/ ctx[2]
  					? "mdc-list--non-interactive"
  					: "") + "\n      " + (/*dense*/ ctx[3] ? "mdc-list--dense" : "") + "\n      " + (/*avatarList*/ ctx[4] ? "mdc-list--avatar-list" : "") + "\n      " + (/*twoLine*/ ctx[5] ? "mdc-list--two-line" : "") + "\n      " + (/*threeLine*/ ctx[6] && !/*twoLine*/ ctx[5]
  					? "smui-list--three-line"
  					: "") + "\n    "
  				},
  				dirty[0] & /*role*/ 256 && { role: /*role*/ ctx[8] },
  				dirty[0] & /*props*/ 512 && /*props*/ ctx[9]
  			]));

  			if (useActions_action && is_function(useActions_action.update) && dirty[0] & /*use*/ 1) useActions_action.update.call(null, /*use*/ ctx[0]);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(default_slot, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(default_slot, local);
  			current = false;
  		},
  		d(detaching) {
  			if (detaching) detach(ul);
  			if (default_slot) default_slot.d(detaching);
  			/*ul_binding*/ ctx[31](null);
  			run_all(dispose);
  		}
  	};
  }

  // (1:0) {#if nav}
  function create_if_block$1(ctx) {
  	let nav_1;
  	let useActions_action;
  	let forwardEvents_action;
  	let current;
  	let dispose;
  	const default_slot_template = /*$$slots*/ ctx[29].default;
  	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[28], null);

  	let nav_1_levels = [
  		{
  			class: "\n      mdc-list\n      " + /*className*/ ctx[1] + "\n      " + (/*nonInteractive*/ ctx[2]
  			? "mdc-list--non-interactive"
  			: "") + "\n      " + (/*dense*/ ctx[3] ? "mdc-list--dense" : "") + "\n      " + (/*avatarList*/ ctx[4] ? "mdc-list--avatar-list" : "") + "\n      " + (/*twoLine*/ ctx[5] ? "mdc-list--two-line" : "") + "\n      " + (/*threeLine*/ ctx[6] && !/*twoLine*/ ctx[5]
  			? "smui-list--three-line"
  			: "") + "\n    "
  		},
  		/*props*/ ctx[9]
  	];

  	let nav_1_data = {};

  	for (let i = 0; i < nav_1_levels.length; i += 1) {
  		nav_1_data = assign(nav_1_data, nav_1_levels[i]);
  	}

  	return {
  		c() {
  			nav_1 = element("nav");
  			if (default_slot) default_slot.c();
  			set_attributes(nav_1, nav_1_data);
  		},
  		m(target, anchor) {
  			insert(target, nav_1, anchor);

  			if (default_slot) {
  				default_slot.m(nav_1, null);
  			}

  			/*nav_1_binding*/ ctx[30](nav_1);
  			current = true;

  			dispose = [
  				action_destroyer(useActions_action = useActions.call(null, nav_1, /*use*/ ctx[0])),
  				action_destroyer(forwardEvents_action = /*forwardEvents*/ ctx[10].call(null, nav_1)),
  				listen(nav_1, "MDCList:action", /*handleAction*/ ctx[12])
  			];
  		},
  		p(ctx, dirty) {
  			if (default_slot && default_slot.p && dirty[0] & /*$$scope*/ 268435456) {
  				default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[28], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[28], dirty, null));
  			}

  			set_attributes(nav_1, get_spread_update(nav_1_levels, [
  				dirty[0] & /*className, nonInteractive, dense, avatarList, twoLine, threeLine*/ 126 && {
  					class: "\n      mdc-list\n      " + /*className*/ ctx[1] + "\n      " + (/*nonInteractive*/ ctx[2]
  					? "mdc-list--non-interactive"
  					: "") + "\n      " + (/*dense*/ ctx[3] ? "mdc-list--dense" : "") + "\n      " + (/*avatarList*/ ctx[4] ? "mdc-list--avatar-list" : "") + "\n      " + (/*twoLine*/ ctx[5] ? "mdc-list--two-line" : "") + "\n      " + (/*threeLine*/ ctx[6] && !/*twoLine*/ ctx[5]
  					? "smui-list--three-line"
  					: "") + "\n    "
  				},
  				dirty[0] & /*props*/ 512 && /*props*/ ctx[9]
  			]));

  			if (useActions_action && is_function(useActions_action.update) && dirty[0] & /*use*/ 1) useActions_action.update.call(null, /*use*/ ctx[0]);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(default_slot, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(default_slot, local);
  			current = false;
  		},
  		d(detaching) {
  			if (detaching) detach(nav_1);
  			if (default_slot) default_slot.d(detaching);
  			/*nav_1_binding*/ ctx[30](null);
  			run_all(dispose);
  		}
  	};
  }

  function create_fragment$c(ctx) {
  	let current_block_type_index;
  	let if_block;
  	let if_block_anchor;
  	let current;
  	const if_block_creators = [create_if_block$1, create_else_block$1];
  	const if_blocks = [];

  	function select_block_type(ctx, dirty) {
  		if (/*nav*/ ctx[11]) return 0;
  		return 1;
  	}

  	current_block_type_index = select_block_type(ctx);
  	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

  	return {
  		c() {
  			if_block.c();
  			if_block_anchor = empty();
  		},
  		m(target, anchor) {
  			if_blocks[current_block_type_index].m(target, anchor);
  			insert(target, if_block_anchor, anchor);
  			current = true;
  		},
  		p(ctx, dirty) {
  			if_block.p(ctx, dirty);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(if_block);
  			current = true;
  		},
  		o(local) {
  			transition_out(if_block);
  			current = false;
  		},
  		d(detaching) {
  			if_blocks[current_block_type_index].d(detaching);
  			if (detaching) detach(if_block_anchor);
  		}
  	};
  }

  function instance$c($$self, $$props, $$invalidate) {
  	const forwardEvents = forwardEventsBuilder(current_component, ["MDCList:action"]);
  	let { use = [] } = $$props;
  	let { class: className = "" } = $$props;
  	let { nonInteractive = false } = $$props;
  	let { dense = false } = $$props;
  	let { avatarList = false } = $$props;
  	let { twoLine = false } = $$props;
  	let { threeLine = false } = $$props;
  	let { vertical = true } = $$props;
  	let { wrapFocus = false } = $$props;
  	let { singleSelection = false } = $$props;
  	let { selectedIndex = null } = $$props;
  	let { radiolist = false } = $$props;
  	let { checklist = false } = $$props;
  	let element;
  	let list;
  	let role = getContext("SMUI:list:role");
  	let nav = getContext("SMUI:list:nav");
  	let instantiate = getContext("SMUI:list:instantiate");
  	let getInstance = getContext("SMUI:list:getInstance");
  	let addLayoutListener = getContext("SMUI:addLayoutListener");
  	let removeLayoutListener;
  	setContext("SMUI:list:nonInteractive", nonInteractive);

  	if (!role) {
  		if (singleSelection) {
  			role = "listbox";
  			setContext("SMUI:list:item:role", "option");
  		} else if (radiolist) {
  			role = "radiogroup";
  			setContext("SMUI:list:item:role", "radio");
  		} else if (checklist) {
  			role = "group";
  			setContext("SMUI:list:item:role", "checkbox");
  		} else {
  			role = "list";
  			setContext("SMUI:list:item:role", undefined);
  		}
  	}

  	if (addLayoutListener) {
  		removeLayoutListener = addLayoutListener(layout);
  	}

  	onMount(async () => {
  		if (instantiate !== false) {
  			$$invalidate(22, list = new MDCList(element));
  		} else {
  			$$invalidate(22, list = await getInstance());
  		}

  		if (singleSelection) {
  			list.initializeListType();
  			$$invalidate(13, selectedIndex = list.selectedIndex);
  		}
  	});

  	onDestroy(() => {
  		if (instantiate !== false) {
  			list && list.destroy();
  		}

  		if (removeLayoutListener) {
  			removeLayoutListener();
  		}
  	});

  	function handleAction(e) {
  		if (list && list.listElements[e.detail.index].classList.contains("mdc-list-item--disabled")) {
  			e.preventDefault();
  			$$invalidate(22, list.selectedIndex = selectedIndex, list);
  		} else if (list && list.selectedIndex === e.detail.index) {
  			$$invalidate(13, selectedIndex = e.detail.index);
  		}
  	}

  	function layout(...args) {
  		return list.layout(...args);
  	}

  	function setEnabled(...args) {
  		return list.setEnabled(...args);
  	}

  	function getDefaultFoundation(...args) {
  		return list.getDefaultFoundation(...args);
  	}

  	let { $$slots = {}, $$scope } = $$props;

  	function nav_1_binding($$value) {
  		binding_callbacks[$$value ? "unshift" : "push"](() => {
  			$$invalidate(7, element = $$value);
  		});
  	}

  	function ul_binding($$value) {
  		binding_callbacks[$$value ? "unshift" : "push"](() => {
  			$$invalidate(7, element = $$value);
  		});
  	}

  	$$self.$set = $$new_props => {
  		$$invalidate(27, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
  		if ("use" in $$new_props) $$invalidate(0, use = $$new_props.use);
  		if ("class" in $$new_props) $$invalidate(1, className = $$new_props.class);
  		if ("nonInteractive" in $$new_props) $$invalidate(2, nonInteractive = $$new_props.nonInteractive);
  		if ("dense" in $$new_props) $$invalidate(3, dense = $$new_props.dense);
  		if ("avatarList" in $$new_props) $$invalidate(4, avatarList = $$new_props.avatarList);
  		if ("twoLine" in $$new_props) $$invalidate(5, twoLine = $$new_props.twoLine);
  		if ("threeLine" in $$new_props) $$invalidate(6, threeLine = $$new_props.threeLine);
  		if ("vertical" in $$new_props) $$invalidate(14, vertical = $$new_props.vertical);
  		if ("wrapFocus" in $$new_props) $$invalidate(15, wrapFocus = $$new_props.wrapFocus);
  		if ("singleSelection" in $$new_props) $$invalidate(16, singleSelection = $$new_props.singleSelection);
  		if ("selectedIndex" in $$new_props) $$invalidate(13, selectedIndex = $$new_props.selectedIndex);
  		if ("radiolist" in $$new_props) $$invalidate(17, radiolist = $$new_props.radiolist);
  		if ("checklist" in $$new_props) $$invalidate(18, checklist = $$new_props.checklist);
  		if ("$$scope" in $$new_props) $$invalidate(28, $$scope = $$new_props.$$scope);
  	};

  	let props;

  	$$self.$$.update = () => {
  		 $$invalidate(9, props = exclude($$props, [
  			"use",
  			"class",
  			"nonInteractive",
  			"dense",
  			"avatarList",
  			"twoLine",
  			"threeLine",
  			"vertical",
  			"wrapFocus",
  			"singleSelection",
  			"selectedIndex",
  			"radiolist",
  			"checklist"
  		]));

  		if ($$self.$$.dirty[0] & /*list, vertical*/ 4210688) {
  			 if (list && list.vertical !== vertical) {
  				$$invalidate(22, list.vertical = vertical, list);
  			}
  		}

  		if ($$self.$$.dirty[0] & /*list, wrapFocus*/ 4227072) {
  			 if (list && list.wrapFocus !== wrapFocus) {
  				$$invalidate(22, list.wrapFocus = wrapFocus, list);
  			}
  		}

  		if ($$self.$$.dirty[0] & /*list, singleSelection*/ 4259840) {
  			 if (list && list.singleSelection !== singleSelection) {
  				$$invalidate(22, list.singleSelection = singleSelection, list);
  			}
  		}

  		if ($$self.$$.dirty[0] & /*list, singleSelection, selectedIndex*/ 4268032) {
  			 if (list && singleSelection && list.selectedIndex !== selectedIndex) {
  				$$invalidate(22, list.selectedIndex = selectedIndex, list);
  			}
  		}
  	};

  	$$props = exclude_internal_props($$props);

  	return [
  		use,
  		className,
  		nonInteractive,
  		dense,
  		avatarList,
  		twoLine,
  		threeLine,
  		element,
  		role,
  		props,
  		forwardEvents,
  		nav,
  		handleAction,
  		selectedIndex,
  		vertical,
  		wrapFocus,
  		singleSelection,
  		radiolist,
  		checklist,
  		layout,
  		setEnabled,
  		getDefaultFoundation,
  		list,
  		removeLayoutListener,
  		instantiate,
  		getInstance,
  		addLayoutListener,
  		$$props,
  		$$scope,
  		$$slots,
  		nav_1_binding,
  		ul_binding
  	];
  }

  class List extends SvelteComponent {
  	constructor(options) {
  		super();

  		init(
  			this,
  			options,
  			instance$c,
  			create_fragment$c,
  			safe_not_equal,
  			{
  				use: 0,
  				class: 1,
  				nonInteractive: 2,
  				dense: 3,
  				avatarList: 4,
  				twoLine: 5,
  				threeLine: 6,
  				vertical: 14,
  				wrapFocus: 15,
  				singleSelection: 16,
  				selectedIndex: 13,
  				radiolist: 17,
  				checklist: 18,
  				layout: 19,
  				setEnabled: 20,
  				getDefaultFoundation: 21
  			},
  			[-1, -1]
  		);
  	}

  	get layout() {
  		return this.$$.ctx[19];
  	}

  	get setEnabled() {
  		return this.$$.ctx[20];
  	}

  	get getDefaultFoundation() {
  		return this.$$.ctx[21];
  	}
  }

  /* node_modules/@smui/list/Item.svelte generated by Svelte v3.18.1 */

  function create_else_block$2(ctx) {
  	let li;
  	let useActions_action;
  	let forwardEvents_action;
  	let Ripple_action;
  	let current;
  	let dispose;
  	const default_slot_template = /*$$slots*/ ctx[25].default;
  	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[24], null);

  	let li_levels = [
  		{
  			class: "\n      mdc-list-item\n      " + /*className*/ ctx[2] + "\n      " + (/*activated*/ ctx[5] ? "mdc-list-item--activated" : "") + "\n      " + (/*selected*/ ctx[7] ? "mdc-list-item--selected" : "") + "\n      " + (/*disabled*/ ctx[8] ? "mdc-list-item--disabled" : "") + "\n      " + (/*role*/ ctx[6] === "menuitem" && /*selected*/ ctx[7]
  			? "mdc-menu-item--selected"
  			: "") + "\n    "
  		},
  		{ role: /*role*/ ctx[6] },
  		/*role*/ ctx[6] === "option"
  		? {
  				"aria-selected": /*selected*/ ctx[7] ? "true" : "false"
  			}
  		: {},
  		/*role*/ ctx[6] === "radio" || /*role*/ ctx[6] === "checkbox"
  		? {
  				"aria-checked": /*checked*/ ctx[10] ? "true" : "false"
  			}
  		: {},
  		{ tabindex: /*tabindex*/ ctx[0] },
  		/*props*/ ctx[12]
  	];

  	let li_data = {};

  	for (let i = 0; i < li_levels.length; i += 1) {
  		li_data = assign(li_data, li_levels[i]);
  	}

  	return {
  		c() {
  			li = element("li");
  			if (default_slot) default_slot.c();
  			set_attributes(li, li_data);
  		},
  		m(target, anchor) {
  			insert(target, li, anchor);

  			if (default_slot) {
  				default_slot.m(li, null);
  			}

  			/*li_binding*/ ctx[28](li);
  			current = true;

  			dispose = [
  				action_destroyer(useActions_action = useActions.call(null, li, /*use*/ ctx[1])),
  				action_destroyer(forwardEvents_action = /*forwardEvents*/ ctx[13].call(null, li)),
  				action_destroyer(Ripple_action = Ripple.call(null, li, {
  					ripple: /*ripple*/ ctx[3],
  					unbounded: false,
  					color: /*color*/ ctx[4]
  				})),
  				listen(li, "click", /*action*/ ctx[15]),
  				listen(li, "keydown", /*handleKeydown*/ ctx[16])
  			];
  		},
  		p(ctx, dirty) {
  			if (default_slot && default_slot.p && dirty & /*$$scope*/ 16777216) {
  				default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[24], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[24], dirty, null));
  			}

  			set_attributes(li, get_spread_update(li_levels, [
  				dirty & /*className, activated, selected, disabled, role*/ 484 && {
  					class: "\n      mdc-list-item\n      " + /*className*/ ctx[2] + "\n      " + (/*activated*/ ctx[5] ? "mdc-list-item--activated" : "") + "\n      " + (/*selected*/ ctx[7] ? "mdc-list-item--selected" : "") + "\n      " + (/*disabled*/ ctx[8] ? "mdc-list-item--disabled" : "") + "\n      " + (/*role*/ ctx[6] === "menuitem" && /*selected*/ ctx[7]
  					? "mdc-menu-item--selected"
  					: "") + "\n    "
  				},
  				dirty & /*role*/ 64 && { role: /*role*/ ctx[6] },
  				dirty & /*role, selected*/ 192 && (/*role*/ ctx[6] === "option"
  				? {
  						"aria-selected": /*selected*/ ctx[7] ? "true" : "false"
  					}
  				: {}),
  				dirty & /*role, checked*/ 1088 && (/*role*/ ctx[6] === "radio" || /*role*/ ctx[6] === "checkbox"
  				? {
  						"aria-checked": /*checked*/ ctx[10] ? "true" : "false"
  					}
  				: {}),
  				dirty & /*tabindex*/ 1 && { tabindex: /*tabindex*/ ctx[0] },
  				dirty & /*props*/ 4096 && /*props*/ ctx[12]
  			]));

  			if (useActions_action && is_function(useActions_action.update) && dirty & /*use*/ 2) useActions_action.update.call(null, /*use*/ ctx[1]);

  			if (Ripple_action && is_function(Ripple_action.update) && dirty & /*ripple, color*/ 24) Ripple_action.update.call(null, {
  				ripple: /*ripple*/ ctx[3],
  				unbounded: false,
  				color: /*color*/ ctx[4]
  			});
  		},
  		i(local) {
  			if (current) return;
  			transition_in(default_slot, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(default_slot, local);
  			current = false;
  		},
  		d(detaching) {
  			if (detaching) detach(li);
  			if (default_slot) default_slot.d(detaching);
  			/*li_binding*/ ctx[28](null);
  			run_all(dispose);
  		}
  	};
  }

  // (21:23) 
  function create_if_block_1(ctx) {
  	let span;
  	let useActions_action;
  	let forwardEvents_action;
  	let Ripple_action;
  	let current;
  	let dispose;
  	const default_slot_template = /*$$slots*/ ctx[25].default;
  	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[24], null);

  	let span_levels = [
  		{
  			class: "\n      mdc-list-item\n      " + /*className*/ ctx[2] + "\n      " + (/*activated*/ ctx[5] ? "mdc-list-item--activated" : "") + "\n      " + (/*selected*/ ctx[7] ? "mdc-list-item--selected" : "") + "\n      " + (/*disabled*/ ctx[8] ? "mdc-list-item--disabled" : "") + "\n    "
  		},
  		/*activated*/ ctx[5] ? { "aria-current": "page" } : {},
  		{ tabindex: /*tabindex*/ ctx[0] },
  		/*props*/ ctx[12]
  	];

  	let span_data = {};

  	for (let i = 0; i < span_levels.length; i += 1) {
  		span_data = assign(span_data, span_levels[i]);
  	}

  	return {
  		c() {
  			span = element("span");
  			if (default_slot) default_slot.c();
  			set_attributes(span, span_data);
  		},
  		m(target, anchor) {
  			insert(target, span, anchor);

  			if (default_slot) {
  				default_slot.m(span, null);
  			}

  			/*span_binding*/ ctx[27](span);
  			current = true;

  			dispose = [
  				action_destroyer(useActions_action = useActions.call(null, span, /*use*/ ctx[1])),
  				action_destroyer(forwardEvents_action = /*forwardEvents*/ ctx[13].call(null, span)),
  				action_destroyer(Ripple_action = Ripple.call(null, span, {
  					ripple: /*ripple*/ ctx[3],
  					unbounded: false,
  					color: /*color*/ ctx[4]
  				})),
  				listen(span, "click", /*action*/ ctx[15]),
  				listen(span, "keydown", /*handleKeydown*/ ctx[16])
  			];
  		},
  		p(ctx, dirty) {
  			if (default_slot && default_slot.p && dirty & /*$$scope*/ 16777216) {
  				default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[24], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[24], dirty, null));
  			}

  			set_attributes(span, get_spread_update(span_levels, [
  				dirty & /*className, activated, selected, disabled*/ 420 && {
  					class: "\n      mdc-list-item\n      " + /*className*/ ctx[2] + "\n      " + (/*activated*/ ctx[5] ? "mdc-list-item--activated" : "") + "\n      " + (/*selected*/ ctx[7] ? "mdc-list-item--selected" : "") + "\n      " + (/*disabled*/ ctx[8] ? "mdc-list-item--disabled" : "") + "\n    "
  				},
  				dirty & /*activated*/ 32 && (/*activated*/ ctx[5] ? { "aria-current": "page" } : {}),
  				dirty & /*tabindex*/ 1 && { tabindex: /*tabindex*/ ctx[0] },
  				dirty & /*props*/ 4096 && /*props*/ ctx[12]
  			]));

  			if (useActions_action && is_function(useActions_action.update) && dirty & /*use*/ 2) useActions_action.update.call(null, /*use*/ ctx[1]);

  			if (Ripple_action && is_function(Ripple_action.update) && dirty & /*ripple, color*/ 24) Ripple_action.update.call(null, {
  				ripple: /*ripple*/ ctx[3],
  				unbounded: false,
  				color: /*color*/ ctx[4]
  			});
  		},
  		i(local) {
  			if (current) return;
  			transition_in(default_slot, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(default_slot, local);
  			current = false;
  		},
  		d(detaching) {
  			if (detaching) detach(span);
  			if (default_slot) default_slot.d(detaching);
  			/*span_binding*/ ctx[27](null);
  			run_all(dispose);
  		}
  	};
  }

  // (1:0) {#if nav && href}
  function create_if_block$2(ctx) {
  	let a;
  	let useActions_action;
  	let forwardEvents_action;
  	let Ripple_action;
  	let current;
  	let dispose;
  	const default_slot_template = /*$$slots*/ ctx[25].default;
  	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[24], null);

  	let a_levels = [
  		{
  			class: "\n      mdc-list-item\n      " + /*className*/ ctx[2] + "\n      " + (/*activated*/ ctx[5] ? "mdc-list-item--activated" : "") + "\n      " + (/*selected*/ ctx[7] ? "mdc-list-item--selected" : "") + "\n      " + (/*disabled*/ ctx[8] ? "mdc-list-item--disabled" : "") + "\n    "
  		},
  		{ href: /*href*/ ctx[9] },
  		/*activated*/ ctx[5] ? { "aria-current": "page" } : {},
  		{ tabindex: /*tabindex*/ ctx[0] },
  		/*props*/ ctx[12]
  	];

  	let a_data = {};

  	for (let i = 0; i < a_levels.length; i += 1) {
  		a_data = assign(a_data, a_levels[i]);
  	}

  	return {
  		c() {
  			a = element("a");
  			if (default_slot) default_slot.c();
  			set_attributes(a, a_data);
  		},
  		m(target, anchor) {
  			insert(target, a, anchor);

  			if (default_slot) {
  				default_slot.m(a, null);
  			}

  			/*a_binding*/ ctx[26](a);
  			current = true;

  			dispose = [
  				action_destroyer(useActions_action = useActions.call(null, a, /*use*/ ctx[1])),
  				action_destroyer(forwardEvents_action = /*forwardEvents*/ ctx[13].call(null, a)),
  				action_destroyer(Ripple_action = Ripple.call(null, a, {
  					ripple: /*ripple*/ ctx[3],
  					unbounded: false,
  					color: /*color*/ ctx[4]
  				})),
  				listen(a, "click", /*action*/ ctx[15]),
  				listen(a, "keydown", /*handleKeydown*/ ctx[16])
  			];
  		},
  		p(ctx, dirty) {
  			if (default_slot && default_slot.p && dirty & /*$$scope*/ 16777216) {
  				default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[24], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[24], dirty, null));
  			}

  			set_attributes(a, get_spread_update(a_levels, [
  				dirty & /*className, activated, selected, disabled*/ 420 && {
  					class: "\n      mdc-list-item\n      " + /*className*/ ctx[2] + "\n      " + (/*activated*/ ctx[5] ? "mdc-list-item--activated" : "") + "\n      " + (/*selected*/ ctx[7] ? "mdc-list-item--selected" : "") + "\n      " + (/*disabled*/ ctx[8] ? "mdc-list-item--disabled" : "") + "\n    "
  				},
  				dirty & /*href*/ 512 && { href: /*href*/ ctx[9] },
  				dirty & /*activated*/ 32 && (/*activated*/ ctx[5] ? { "aria-current": "page" } : {}),
  				dirty & /*tabindex*/ 1 && { tabindex: /*tabindex*/ ctx[0] },
  				dirty & /*props*/ 4096 && /*props*/ ctx[12]
  			]));

  			if (useActions_action && is_function(useActions_action.update) && dirty & /*use*/ 2) useActions_action.update.call(null, /*use*/ ctx[1]);

  			if (Ripple_action && is_function(Ripple_action.update) && dirty & /*ripple, color*/ 24) Ripple_action.update.call(null, {
  				ripple: /*ripple*/ ctx[3],
  				unbounded: false,
  				color: /*color*/ ctx[4]
  			});
  		},
  		i(local) {
  			if (current) return;
  			transition_in(default_slot, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(default_slot, local);
  			current = false;
  		},
  		d(detaching) {
  			if (detaching) detach(a);
  			if (default_slot) default_slot.d(detaching);
  			/*a_binding*/ ctx[26](null);
  			run_all(dispose);
  		}
  	};
  }

  function create_fragment$d(ctx) {
  	let current_block_type_index;
  	let if_block;
  	let if_block_anchor;
  	let current;
  	const if_block_creators = [create_if_block$2, create_if_block_1, create_else_block$2];
  	const if_blocks = [];

  	function select_block_type(ctx, dirty) {
  		if (/*nav*/ ctx[14] && /*href*/ ctx[9]) return 0;
  		if (/*nav*/ ctx[14] && !/*href*/ ctx[9]) return 1;
  		return 2;
  	}

  	current_block_type_index = select_block_type(ctx);
  	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

  	return {
  		c() {
  			if_block.c();
  			if_block_anchor = empty();
  		},
  		m(target, anchor) {
  			if_blocks[current_block_type_index].m(target, anchor);
  			insert(target, if_block_anchor, anchor);
  			current = true;
  		},
  		p(ctx, [dirty]) {
  			let previous_block_index = current_block_type_index;
  			current_block_type_index = select_block_type(ctx);

  			if (current_block_type_index === previous_block_index) {
  				if_blocks[current_block_type_index].p(ctx, dirty);
  			} else {
  				group_outros();

  				transition_out(if_blocks[previous_block_index], 1, 1, () => {
  					if_blocks[previous_block_index] = null;
  				});

  				check_outros();
  				if_block = if_blocks[current_block_type_index];

  				if (!if_block) {
  					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
  					if_block.c();
  				}

  				transition_in(if_block, 1);
  				if_block.m(if_block_anchor.parentNode, if_block_anchor);
  			}
  		},
  		i(local) {
  			if (current) return;
  			transition_in(if_block);
  			current = true;
  		},
  		o(local) {
  			transition_out(if_block);
  			current = false;
  		},
  		d(detaching) {
  			if_blocks[current_block_type_index].d(detaching);
  			if (detaching) detach(if_block_anchor);
  		}
  	};
  }

  let counter = 0;

  function instance$d($$self, $$props, $$invalidate) {
  	const dispatch = createEventDispatcher();
  	const forwardEvents = forwardEventsBuilder(current_component);
  	let checked = false;
  	let { use = [] } = $$props;
  	let { class: className = "" } = $$props;
  	let { ripple = true } = $$props;
  	let { color = null } = $$props;
  	let { nonInteractive = getContext("SMUI:list:nonInteractive") } = $$props;
  	let { activated = false } = $$props;
  	let { role = getContext("SMUI:list:item:role") } = $$props;
  	let { selected = false } = $$props;
  	let { disabled = false } = $$props;
  	let { tabindex = !nonInteractive && !disabled && (selected || checked) && "0" || "-1" } = $$props;
  	let { href = false } = $$props;
  	let { inputId = "SMUI-form-field-list-" + counter++ } = $$props;
  	let element;
  	let addTabindexIfNoItemsSelectedRaf;
  	let nav = getContext("SMUI:list:item:nav");
  	setContext("SMUI:generic:input:props", { id: inputId });
  	setContext("SMUI:generic:input:setChecked", setChecked);

  	onMount(() => {
  		// Tabindex needs to be '0' if this is the first non-disabled list item, and
  		// no other item is selected.
  		if (!selected && !nonInteractive) {
  			let first = true;
  			let el = element;

  			while (el.previousSibling) {
  				el = el.previousSibling;

  				if (el.nodeType === 1 && el.classList.contains("mdc-list-item") && !el.classList.contains("mdc-list-item--disabled")) {
  					first = false;
  					break;
  				}
  			}

  			if (first) {
  				// This is first, so now set up a check that no other items are
  				// selected.
  				addTabindexIfNoItemsSelectedRaf = window.requestAnimationFrame(addTabindexIfNoItemsSelected);
  			}
  		}
  	});

  	onDestroy(() => {
  		if (addTabindexIfNoItemsSelectedRaf) {
  			window.cancelAnimationFrame(addTabindexIfNoItemsSelectedRaf);
  		}
  	});

  	function addTabindexIfNoItemsSelected() {
  		// Look through next siblings to see if none of them are selected.
  		let noneSelected = true;

  		let el = element;

  		while (el.nextSibling) {
  			el = el.nextSibling;

  			if (el.nodeType === 1 && el.classList.contains("mdc-list-item") && el.attributes["tabindex"] && el.attributes["tabindex"].value === "0") {
  				noneSelected = false;
  				break;
  			}
  		}

  		if (noneSelected) {
  			// This is the first element, and no other element is selected, so the
  			// tabindex should be '0'.
  			$$invalidate(0, tabindex = "0");
  		}
  	}

  	function action(e) {
  		if (disabled) {
  			e.preventDefault();
  		} else {
  			dispatch("SMUI:action", e);
  		}
  	}

  	function handleKeydown(e) {
  		const isEnter = e.key === "Enter" || e.keyCode === 13;
  		const isSpace = e.key === "Space" || e.keyCode === 32;

  		if (isEnter || isSpace) {
  			action(e);
  		}
  	}

  	function setChecked(isChecked) {
  		$$invalidate(10, checked = isChecked);
  		$$invalidate(0, tabindex = !nonInteractive && !disabled && (selected || checked) && "0" || "-1");
  	}

  	let { $$slots = {}, $$scope } = $$props;

  	function a_binding($$value) {
  		binding_callbacks[$$value ? "unshift" : "push"](() => {
  			$$invalidate(11, element = $$value);
  		});
  	}

  	function span_binding($$value) {
  		binding_callbacks[$$value ? "unshift" : "push"](() => {
  			$$invalidate(11, element = $$value);
  		});
  	}

  	function li_binding($$value) {
  		binding_callbacks[$$value ? "unshift" : "push"](() => {
  			$$invalidate(11, element = $$value);
  		});
  	}

  	$$self.$set = $$new_props => {
  		$$invalidate(23, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
  		if ("use" in $$new_props) $$invalidate(1, use = $$new_props.use);
  		if ("class" in $$new_props) $$invalidate(2, className = $$new_props.class);
  		if ("ripple" in $$new_props) $$invalidate(3, ripple = $$new_props.ripple);
  		if ("color" in $$new_props) $$invalidate(4, color = $$new_props.color);
  		if ("nonInteractive" in $$new_props) $$invalidate(17, nonInteractive = $$new_props.nonInteractive);
  		if ("activated" in $$new_props) $$invalidate(5, activated = $$new_props.activated);
  		if ("role" in $$new_props) $$invalidate(6, role = $$new_props.role);
  		if ("selected" in $$new_props) $$invalidate(7, selected = $$new_props.selected);
  		if ("disabled" in $$new_props) $$invalidate(8, disabled = $$new_props.disabled);
  		if ("tabindex" in $$new_props) $$invalidate(0, tabindex = $$new_props.tabindex);
  		if ("href" in $$new_props) $$invalidate(9, href = $$new_props.href);
  		if ("inputId" in $$new_props) $$invalidate(18, inputId = $$new_props.inputId);
  		if ("$$scope" in $$new_props) $$invalidate(24, $$scope = $$new_props.$$scope);
  	};

  	let props;

  	$$self.$$.update = () => {
  		 $$invalidate(12, props = exclude($$props, [
  			"use",
  			"class",
  			"ripple",
  			"color",
  			"nonInteractive",
  			"activated",
  			"selected",
  			"disabled",
  			"tabindex",
  			"href",
  			"inputId"
  		]));
  	};

  	$$props = exclude_internal_props($$props);

  	return [
  		tabindex,
  		use,
  		className,
  		ripple,
  		color,
  		activated,
  		role,
  		selected,
  		disabled,
  		href,
  		checked,
  		element,
  		props,
  		forwardEvents,
  		nav,
  		action,
  		handleKeydown,
  		nonInteractive,
  		inputId,
  		addTabindexIfNoItemsSelectedRaf,
  		dispatch,
  		addTabindexIfNoItemsSelected,
  		setChecked,
  		$$props,
  		$$scope,
  		$$slots,
  		a_binding,
  		span_binding,
  		li_binding
  	];
  }

  class Item extends SvelteComponent {
  	constructor(options) {
  		super();

  		init(this, options, instance$d, create_fragment$d, safe_not_equal, {
  			use: 1,
  			class: 2,
  			ripple: 3,
  			color: 4,
  			nonInteractive: 17,
  			activated: 5,
  			role: 6,
  			selected: 7,
  			disabled: 8,
  			tabindex: 0,
  			href: 9,
  			inputId: 18
  		});
  	}
  }

  var Text = classAdderBuilder({
    class: 'mdc-list-item__text',
    component: Span,
    contexts: {}
  });

  classAdderBuilder({
    class: 'mdc-list-item__primary-text',
    component: Span,
    contexts: {}
  });

  classAdderBuilder({
    class: 'mdc-list-item__secondary-text',
    component: Span,
    contexts: {}
  });

  var Graphic = classAdderBuilder({
    class: 'mdc-list-item__graphic',
    component: Span,
    contexts: {}
  });

  classAdderBuilder({
    class: 'mdc-list-item__meta',
    component: Span,
    contexts: {}
  });

  classAdderBuilder({
    class: 'mdc-list-group',
    component: Div,
    contexts: {}
  });

  /* node_modules/@smui/common/H3.svelte generated by Svelte v3.18.1 */

  function create_fragment$e(ctx) {
  	let h3;
  	let useActions_action;
  	let forwardEvents_action;
  	let current;
  	let dispose;
  	const default_slot_template = /*$$slots*/ ctx[4].default;
  	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[3], null);
  	let h3_levels = [exclude(/*$$props*/ ctx[2], ["use"])];
  	let h3_data = {};

  	for (let i = 0; i < h3_levels.length; i += 1) {
  		h3_data = assign(h3_data, h3_levels[i]);
  	}

  	return {
  		c() {
  			h3 = element("h3");
  			if (default_slot) default_slot.c();
  			set_attributes(h3, h3_data);
  		},
  		m(target, anchor) {
  			insert(target, h3, anchor);

  			if (default_slot) {
  				default_slot.m(h3, null);
  			}

  			current = true;

  			dispose = [
  				action_destroyer(useActions_action = useActions.call(null, h3, /*use*/ ctx[0])),
  				action_destroyer(forwardEvents_action = /*forwardEvents*/ ctx[1].call(null, h3))
  			];
  		},
  		p(ctx, [dirty]) {
  			if (default_slot && default_slot.p && dirty & /*$$scope*/ 8) {
  				default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[3], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[3], dirty, null));
  			}

  			set_attributes(h3, get_spread_update(h3_levels, [dirty & /*exclude, $$props*/ 4 && exclude(/*$$props*/ ctx[2], ["use"])]));
  			if (useActions_action && is_function(useActions_action.update) && dirty & /*use*/ 1) useActions_action.update.call(null, /*use*/ ctx[0]);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(default_slot, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(default_slot, local);
  			current = false;
  		},
  		d(detaching) {
  			if (detaching) detach(h3);
  			if (default_slot) default_slot.d(detaching);
  			run_all(dispose);
  		}
  	};
  }

  function instance$e($$self, $$props, $$invalidate) {
  	const forwardEvents = forwardEventsBuilder(current_component);
  	let { use = [] } = $$props;
  	let { $$slots = {}, $$scope } = $$props;

  	$$self.$set = $$new_props => {
  		$$invalidate(2, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
  		if ("use" in $$new_props) $$invalidate(0, use = $$new_props.use);
  		if ("$$scope" in $$new_props) $$invalidate(3, $$scope = $$new_props.$$scope);
  	};

  	$$props = exclude_internal_props($$props);
  	return [use, forwardEvents, $$props, $$scope, $$slots];
  }

  class H3 extends SvelteComponent {
  	constructor(options) {
  		super();
  		init(this, options, instance$e, create_fragment$e, safe_not_equal, { use: 0 });
  	}
  }

  var Subheader = classAdderBuilder({
    class: 'mdc-list-group__subheader',
    component: H3,
    contexts: {}
  });

  /* node_modules/@smui/list/Separator.svelte generated by Svelte v3.18.1 */

  function create_else_block$3(ctx) {
  	let li;
  	let useActions_action;
  	let forwardEvents_action;
  	let dispose;

  	let li_levels = [
  		{
  			class: "\n      mdc-list-divider\n      " + /*className*/ ctx[1] + "\n      " + (/*padded*/ ctx[4] ? "mdc-list-divider--padded" : "") + "\n      " + (/*inset*/ ctx[5] ? "mdc-list-divider--inset" : "") + "\n    "
  		},
  		{ role: "separator" },
  		/*props*/ ctx[6]
  	];

  	let li_data = {};

  	for (let i = 0; i < li_levels.length; i += 1) {
  		li_data = assign(li_data, li_levels[i]);
  	}

  	return {
  		c() {
  			li = element("li");
  			set_attributes(li, li_data);
  		},
  		m(target, anchor) {
  			insert(target, li, anchor);

  			dispose = [
  				action_destroyer(useActions_action = useActions.call(null, li, /*use*/ ctx[0])),
  				action_destroyer(forwardEvents_action = /*forwardEvents*/ ctx[7].call(null, li))
  			];
  		},
  		p(ctx, dirty) {
  			set_attributes(li, get_spread_update(li_levels, [
  				dirty & /*className, padded, inset*/ 50 && {
  					class: "\n      mdc-list-divider\n      " + /*className*/ ctx[1] + "\n      " + (/*padded*/ ctx[4] ? "mdc-list-divider--padded" : "") + "\n      " + (/*inset*/ ctx[5] ? "mdc-list-divider--inset" : "") + "\n    "
  				},
  				{ role: "separator" },
  				dirty & /*props*/ 64 && /*props*/ ctx[6]
  			]));

  			if (useActions_action && is_function(useActions_action.update) && dirty & /*use*/ 1) useActions_action.update.call(null, /*use*/ ctx[0]);
  		},
  		d(detaching) {
  			if (detaching) detach(li);
  			run_all(dispose);
  		}
  	};
  }

  // (1:0) {#if group || nav}
  function create_if_block$3(ctx) {
  	let hr;
  	let useActions_action;
  	let forwardEvents_action;
  	let dispose;

  	let hr_levels = [
  		{
  			class: "\n      mdc-list-divider\n      " + /*className*/ ctx[1] + "\n      " + (/*padded*/ ctx[4] ? "mdc-list-divider--padded" : "") + "\n      " + (/*inset*/ ctx[5] ? "mdc-list-divider--inset" : "") + "\n    "
  		},
  		/*props*/ ctx[6]
  	];

  	let hr_data = {};

  	for (let i = 0; i < hr_levels.length; i += 1) {
  		hr_data = assign(hr_data, hr_levels[i]);
  	}

  	return {
  		c() {
  			hr = element("hr");
  			set_attributes(hr, hr_data);
  		},
  		m(target, anchor) {
  			insert(target, hr, anchor);

  			dispose = [
  				action_destroyer(useActions_action = useActions.call(null, hr, /*use*/ ctx[0])),
  				action_destroyer(forwardEvents_action = /*forwardEvents*/ ctx[7].call(null, hr))
  			];
  		},
  		p(ctx, dirty) {
  			set_attributes(hr, get_spread_update(hr_levels, [
  				dirty & /*className, padded, inset*/ 50 && {
  					class: "\n      mdc-list-divider\n      " + /*className*/ ctx[1] + "\n      " + (/*padded*/ ctx[4] ? "mdc-list-divider--padded" : "") + "\n      " + (/*inset*/ ctx[5] ? "mdc-list-divider--inset" : "") + "\n    "
  				},
  				dirty & /*props*/ 64 && /*props*/ ctx[6]
  			]));

  			if (useActions_action && is_function(useActions_action.update) && dirty & /*use*/ 1) useActions_action.update.call(null, /*use*/ ctx[0]);
  		},
  		d(detaching) {
  			if (detaching) detach(hr);
  			run_all(dispose);
  		}
  	};
  }

  function create_fragment$f(ctx) {
  	let if_block_anchor;

  	function select_block_type(ctx, dirty) {
  		if (/*group*/ ctx[2] || /*nav*/ ctx[3]) return create_if_block$3;
  		return create_else_block$3;
  	}

  	let current_block_type = select_block_type(ctx);
  	let if_block = current_block_type(ctx);

  	return {
  		c() {
  			if_block.c();
  			if_block_anchor = empty();
  		},
  		m(target, anchor) {
  			if_block.m(target, anchor);
  			insert(target, if_block_anchor, anchor);
  		},
  		p(ctx, [dirty]) {
  			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
  				if_block.p(ctx, dirty);
  			} else {
  				if_block.d(1);
  				if_block = current_block_type(ctx);

  				if (if_block) {
  					if_block.c();
  					if_block.m(if_block_anchor.parentNode, if_block_anchor);
  				}
  			}
  		},
  		i: noop,
  		o: noop,
  		d(detaching) {
  			if_block.d(detaching);
  			if (detaching) detach(if_block_anchor);
  		}
  	};
  }

  function instance$f($$self, $$props, $$invalidate) {
  	const forwardEvents = forwardEventsBuilder(current_component);
  	let { use = [] } = $$props;
  	let { class: className = "" } = $$props;
  	let { group = false } = $$props;
  	let { nav = false } = $$props;
  	let { padded = false } = $$props;
  	let { inset = false } = $$props;

  	$$self.$set = $$new_props => {
  		$$invalidate(8, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
  		if ("use" in $$new_props) $$invalidate(0, use = $$new_props.use);
  		if ("class" in $$new_props) $$invalidate(1, className = $$new_props.class);
  		if ("group" in $$new_props) $$invalidate(2, group = $$new_props.group);
  		if ("nav" in $$new_props) $$invalidate(3, nav = $$new_props.nav);
  		if ("padded" in $$new_props) $$invalidate(4, padded = $$new_props.padded);
  		if ("inset" in $$new_props) $$invalidate(5, inset = $$new_props.inset);
  	};

  	let props;

  	$$self.$$.update = () => {
  		 $$invalidate(6, props = exclude($$props, ["use", "class", "group", "nav", "padded", "inset"]));
  	};

  	$$props = exclude_internal_props($$props);
  	return [use, className, group, nav, padded, inset, props, forwardEvents];
  }

  class Separator extends SvelteComponent {
  	constructor(options) {
  		super();

  		init(this, options, instance$f, create_fragment$f, safe_not_equal, {
  			use: 0,
  			class: 1,
  			group: 2,
  			nav: 3,
  			padded: 4,
  			inset: 5
  		});
  	}
  }

  /* node_modules/@smui/common/H4.svelte generated by Svelte v3.18.1 */

  function create_fragment$g(ctx) {
  	let h4;
  	let useActions_action;
  	let forwardEvents_action;
  	let current;
  	let dispose;
  	const default_slot_template = /*$$slots*/ ctx[4].default;
  	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[3], null);
  	let h4_levels = [exclude(/*$$props*/ ctx[2], ["use"])];
  	let h4_data = {};

  	for (let i = 0; i < h4_levels.length; i += 1) {
  		h4_data = assign(h4_data, h4_levels[i]);
  	}

  	return {
  		c() {
  			h4 = element("h4");
  			if (default_slot) default_slot.c();
  			set_attributes(h4, h4_data);
  		},
  		m(target, anchor) {
  			insert(target, h4, anchor);

  			if (default_slot) {
  				default_slot.m(h4, null);
  			}

  			current = true;

  			dispose = [
  				action_destroyer(useActions_action = useActions.call(null, h4, /*use*/ ctx[0])),
  				action_destroyer(forwardEvents_action = /*forwardEvents*/ ctx[1].call(null, h4))
  			];
  		},
  		p(ctx, [dirty]) {
  			if (default_slot && default_slot.p && dirty & /*$$scope*/ 8) {
  				default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[3], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[3], dirty, null));
  			}

  			set_attributes(h4, get_spread_update(h4_levels, [dirty & /*exclude, $$props*/ 4 && exclude(/*$$props*/ ctx[2], ["use"])]));
  			if (useActions_action && is_function(useActions_action.update) && dirty & /*use*/ 1) useActions_action.update.call(null, /*use*/ ctx[0]);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(default_slot, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(default_slot, local);
  			current = false;
  		},
  		d(detaching) {
  			if (detaching) detach(h4);
  			if (default_slot) default_slot.d(detaching);
  			run_all(dispose);
  		}
  	};
  }

  function instance$g($$self, $$props, $$invalidate) {
  	const forwardEvents = forwardEventsBuilder(current_component);
  	let { use = [] } = $$props;
  	let { $$slots = {}, $$scope } = $$props;

  	$$self.$set = $$new_props => {
  		$$invalidate(2, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
  		if ("use" in $$new_props) $$invalidate(0, use = $$new_props.use);
  		if ("$$scope" in $$new_props) $$invalidate(3, $$scope = $$new_props.$$scope);
  	};

  	$$props = exclude_internal_props($$props);
  	return [use, forwardEvents, $$props, $$scope, $$slots];
  }

  class H4 extends SvelteComponent {
  	constructor(options) {
  		super();
  		init(this, options, instance$g, create_fragment$g, safe_not_equal, { use: 0 });
  	}
  }

  // List of nodes to update
  const nodes = [];

  // Current location
  let location$1;

  // Function that updates all nodes marking the active ones
  function checkActive(el) {
      // Remove the active class from all elements
      el.node.classList.remove(el.className);

      // If the pattern matches, then set the active class
      if (el.pattern.test(location$1)) {
          el.node.classList.add(el.className);
      }
  }

  // Listen to changes in the location
  loc.subscribe((value) => {
      // Update the location
      location$1 = value.location + (value.querystring ? '?' + value.querystring : '');

      // Update all nodes
      nodes.map(checkActive);
  });

  /* node_modules/@smui/paper/Paper.svelte generated by Svelte v3.18.1 */

  function create_fragment$h(ctx) {
  	let div;
  	let useActions_action;
  	let forwardEvents_action;
  	let current;
  	let dispose;
  	const default_slot_template = /*$$slots*/ ctx[9].default;
  	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[8], null);

  	let div_levels = [
  		{
  			class: "\n    smui-paper\n    " + /*className*/ ctx[1] + "\n    " + (/*elevation*/ ctx[4] !== 0
  			? "mdc-elevation--z" + /*elevation*/ ctx[4]
  			: "") + "\n    " + (!/*square*/ ctx[2] ? "smui-paper--rounded" : "") + "\n    " + (/*color*/ ctx[3] === "primary"
  			? "smui-paper--color-primary"
  			: "") + "\n    " + (/*color*/ ctx[3] === "secondary"
  			? "smui-paper--color-secondary"
  			: "") + "\n    " + (/*transition*/ ctx[5] ? "mdc-elevation-transition" : "") + "\n  "
  		},
  		exclude(/*$$props*/ ctx[7], ["use", "class", "square", "color", "transition"])
  	];

  	let div_data = {};

  	for (let i = 0; i < div_levels.length; i += 1) {
  		div_data = assign(div_data, div_levels[i]);
  	}

  	return {
  		c() {
  			div = element("div");
  			if (default_slot) default_slot.c();
  			set_attributes(div, div_data);
  		},
  		m(target, anchor) {
  			insert(target, div, anchor);

  			if (default_slot) {
  				default_slot.m(div, null);
  			}

  			current = true;

  			dispose = [
  				action_destroyer(useActions_action = useActions.call(null, div, /*use*/ ctx[0])),
  				action_destroyer(forwardEvents_action = /*forwardEvents*/ ctx[6].call(null, div))
  			];
  		},
  		p(ctx, [dirty]) {
  			if (default_slot && default_slot.p && dirty & /*$$scope*/ 256) {
  				default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[8], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[8], dirty, null));
  			}

  			set_attributes(div, get_spread_update(div_levels, [
  				dirty & /*className, elevation, square, color, transition*/ 62 && {
  					class: "\n    smui-paper\n    " + /*className*/ ctx[1] + "\n    " + (/*elevation*/ ctx[4] !== 0
  					? "mdc-elevation--z" + /*elevation*/ ctx[4]
  					: "") + "\n    " + (!/*square*/ ctx[2] ? "smui-paper--rounded" : "") + "\n    " + (/*color*/ ctx[3] === "primary"
  					? "smui-paper--color-primary"
  					: "") + "\n    " + (/*color*/ ctx[3] === "secondary"
  					? "smui-paper--color-secondary"
  					: "") + "\n    " + (/*transition*/ ctx[5] ? "mdc-elevation-transition" : "") + "\n  "
  				},
  				dirty & /*exclude, $$props*/ 128 && exclude(/*$$props*/ ctx[7], ["use", "class", "square", "color", "transition"])
  			]));

  			if (useActions_action && is_function(useActions_action.update) && dirty & /*use*/ 1) useActions_action.update.call(null, /*use*/ ctx[0]);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(default_slot, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(default_slot, local);
  			current = false;
  		},
  		d(detaching) {
  			if (detaching) detach(div);
  			if (default_slot) default_slot.d(detaching);
  			run_all(dispose);
  		}
  	};
  }

  function instance$h($$self, $$props, $$invalidate) {
  	const forwardEvents = forwardEventsBuilder(current_component);
  	let { use = [] } = $$props;
  	let { class: className = "" } = $$props;
  	let { square = false } = $$props;
  	let { color = "default" } = $$props;
  	let { elevation = 1 } = $$props;
  	let { transition = false } = $$props;
  	let { $$slots = {}, $$scope } = $$props;

  	$$self.$set = $$new_props => {
  		$$invalidate(7, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
  		if ("use" in $$new_props) $$invalidate(0, use = $$new_props.use);
  		if ("class" in $$new_props) $$invalidate(1, className = $$new_props.class);
  		if ("square" in $$new_props) $$invalidate(2, square = $$new_props.square);
  		if ("color" in $$new_props) $$invalidate(3, color = $$new_props.color);
  		if ("elevation" in $$new_props) $$invalidate(4, elevation = $$new_props.elevation);
  		if ("transition" in $$new_props) $$invalidate(5, transition = $$new_props.transition);
  		if ("$$scope" in $$new_props) $$invalidate(8, $$scope = $$new_props.$$scope);
  	};

  	$$props = exclude_internal_props($$props);

  	return [
  		use,
  		className,
  		square,
  		color,
  		elevation,
  		transition,
  		forwardEvents,
  		$$props,
  		$$scope,
  		$$slots
  	];
  }

  class Paper extends SvelteComponent {
  	constructor(options) {
  		super();

  		init(this, options, instance$h, create_fragment$h, safe_not_equal, {
  			use: 0,
  			class: 1,
  			square: 2,
  			color: 3,
  			elevation: 4,
  			transition: 5
  		});
  	}
  }

  var Content$1 = classAdderBuilder({
    class: 'smui-paper__content',
    component: Div,
    contexts: {}
  });

  /* node_modules/@smui/common/H5.svelte generated by Svelte v3.18.1 */

  function create_fragment$i(ctx) {
  	let h5;
  	let useActions_action;
  	let forwardEvents_action;
  	let current;
  	let dispose;
  	const default_slot_template = /*$$slots*/ ctx[4].default;
  	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[3], null);
  	let h5_levels = [exclude(/*$$props*/ ctx[2], ["use"])];
  	let h5_data = {};

  	for (let i = 0; i < h5_levels.length; i += 1) {
  		h5_data = assign(h5_data, h5_levels[i]);
  	}

  	return {
  		c() {
  			h5 = element("h5");
  			if (default_slot) default_slot.c();
  			set_attributes(h5, h5_data);
  		},
  		m(target, anchor) {
  			insert(target, h5, anchor);

  			if (default_slot) {
  				default_slot.m(h5, null);
  			}

  			current = true;

  			dispose = [
  				action_destroyer(useActions_action = useActions.call(null, h5, /*use*/ ctx[0])),
  				action_destroyer(forwardEvents_action = /*forwardEvents*/ ctx[1].call(null, h5))
  			];
  		},
  		p(ctx, [dirty]) {
  			if (default_slot && default_slot.p && dirty & /*$$scope*/ 8) {
  				default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[3], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[3], dirty, null));
  			}

  			set_attributes(h5, get_spread_update(h5_levels, [dirty & /*exclude, $$props*/ 4 && exclude(/*$$props*/ ctx[2], ["use"])]));
  			if (useActions_action && is_function(useActions_action.update) && dirty & /*use*/ 1) useActions_action.update.call(null, /*use*/ ctx[0]);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(default_slot, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(default_slot, local);
  			current = false;
  		},
  		d(detaching) {
  			if (detaching) detach(h5);
  			if (default_slot) default_slot.d(detaching);
  			run_all(dispose);
  		}
  	};
  }

  function instance$i($$self, $$props, $$invalidate) {
  	const forwardEvents = forwardEventsBuilder(current_component);
  	let { use = [] } = $$props;
  	let { $$slots = {}, $$scope } = $$props;

  	$$self.$set = $$new_props => {
  		$$invalidate(2, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
  		if ("use" in $$new_props) $$invalidate(0, use = $$new_props.use);
  		if ("$$scope" in $$new_props) $$invalidate(3, $$scope = $$new_props.$$scope);
  	};

  	$$props = exclude_internal_props($$props);
  	return [use, forwardEvents, $$props, $$scope, $$slots];
  }

  class H5 extends SvelteComponent {
  	constructor(options) {
  		super();
  		init(this, options, instance$i, create_fragment$i, safe_not_equal, { use: 0 });
  	}
  }

  var Title$1 = classAdderBuilder({
    class: 'smui-paper__title',
    component: H5,
    contexts: {}
  });

  /* node_modules/@smui/common/H6.svelte generated by Svelte v3.18.1 */

  function create_fragment$j(ctx) {
  	let h6;
  	let useActions_action;
  	let forwardEvents_action;
  	let current;
  	let dispose;
  	const default_slot_template = /*$$slots*/ ctx[4].default;
  	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[3], null);
  	let h6_levels = [exclude(/*$$props*/ ctx[2], ["use"])];
  	let h6_data = {};

  	for (let i = 0; i < h6_levels.length; i += 1) {
  		h6_data = assign(h6_data, h6_levels[i]);
  	}

  	return {
  		c() {
  			h6 = element("h6");
  			if (default_slot) default_slot.c();
  			set_attributes(h6, h6_data);
  		},
  		m(target, anchor) {
  			insert(target, h6, anchor);

  			if (default_slot) {
  				default_slot.m(h6, null);
  			}

  			current = true;

  			dispose = [
  				action_destroyer(useActions_action = useActions.call(null, h6, /*use*/ ctx[0])),
  				action_destroyer(forwardEvents_action = /*forwardEvents*/ ctx[1].call(null, h6))
  			];
  		},
  		p(ctx, [dirty]) {
  			if (default_slot && default_slot.p && dirty & /*$$scope*/ 8) {
  				default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[3], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[3], dirty, null));
  			}

  			set_attributes(h6, get_spread_update(h6_levels, [dirty & /*exclude, $$props*/ 4 && exclude(/*$$props*/ ctx[2], ["use"])]));
  			if (useActions_action && is_function(useActions_action.update) && dirty & /*use*/ 1) useActions_action.update.call(null, /*use*/ ctx[0]);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(default_slot, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(default_slot, local);
  			current = false;
  		},
  		d(detaching) {
  			if (detaching) detach(h6);
  			if (default_slot) default_slot.d(detaching);
  			run_all(dispose);
  		}
  	};
  }

  function instance$j($$self, $$props, $$invalidate) {
  	const forwardEvents = forwardEventsBuilder(current_component);
  	let { use = [] } = $$props;
  	let { $$slots = {}, $$scope } = $$props;

  	$$self.$set = $$new_props => {
  		$$invalidate(2, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
  		if ("use" in $$new_props) $$invalidate(0, use = $$new_props.use);
  		if ("$$scope" in $$new_props) $$invalidate(3, $$scope = $$new_props.$$scope);
  	};

  	$$props = exclude_internal_props($$props);
  	return [use, forwardEvents, $$props, $$scope, $$slots];
  }

  class H6 extends SvelteComponent {
  	constructor(options) {
  		super();
  		init(this, options, instance$j, create_fragment$j, safe_not_equal, { use: 0 });
  	}
  }

  var Subtitle$1 = classAdderBuilder({
    class: 'smui-paper__subtitle',
    component: H6,
    contexts: {}
  });

  function fade(node, { delay = 0, duration = 400, easing = identity }) {
      const o = +getComputedStyle(node).opacity;
      return {
          delay,
          duration,
          easing,
          css: t => `opacity: ${t * o}`
      };
  }

  /* src/routes/Home.svelte generated by Svelte v3.18.1 */

  function create_default_slot_5(ctx) {
  	let t;

  	return {
  		c() {
  			t = text("Introduction");
  		},
  		m(target, anchor) {
  			insert(target, t, anchor);
  		},
  		d(detaching) {
  			if (detaching) detach(t);
  		}
  	};
  }

  // (15:4) <Content>
  function create_default_slot_4(ctx) {
  	let p0;
  	let t0;
  	let a0;
  	let link_action;
  	let t2;
  	let a1;
  	let link_action_1;
  	let t4;
  	let t5;
  	let p1;
  	let dispose;

  	return {
  		c() {
  			p0 = element("p");
  			t0 = text("This research aims to understand .. how depression trends exist in\n        social networks. A network can be modeled simply as a collection of\n        weighted nodes and directed edges. We plan to collect invasive,\n        anonymous (see\n        ");
  			a0 = element("a");
  			a0.textContent = "data privacy";
  			t2 = text("\n        ) information through a set of questionnaires to model social structure.\n        This anonymous network will then be subjected to trend analysis and\n        modeling. Given that time is sparse and everyone has a lot on their\n        plate, any valid participation in the study will be\n        ");
  			a1 = element("a");
  			a1.textContent = "renumerated";
  			t4 = text("\n        .");
  			t5 = space();
  			p1 = element("p");
  			attr(a0, "href", "/privacy");
  			attr(a1, "href", "/renumeration");
  		},
  		m(target, anchor) {
  			insert(target, p0, anchor);
  			append(p0, t0);
  			append(p0, a0);
  			append(p0, t2);
  			append(p0, a1);
  			append(p0, t4);
  			insert(target, t5, anchor);
  			insert(target, p1, anchor);

  			dispose = [
  				action_destroyer(link_action = link.call(null, a0)),
  				action_destroyer(link_action_1 = link.call(null, a1))
  			];
  		},
  		d(detaching) {
  			if (detaching) detach(p0);
  			if (detaching) detach(t5);
  			if (detaching) detach(p1);
  			run_all(dispose);
  		}
  	};
  }

  // (13:2) <Paper color={'primary'} elevation={10}>
  function create_default_slot_3(ctx) {
  	let t;
  	let current;

  	const title_1 = new Title$1({
  			props: {
  				$$slots: { default: [create_default_slot_5] },
  				$$scope: { ctx }
  			}
  		});

  	const content = new Content$1({
  			props: {
  				$$slots: { default: [create_default_slot_4] },
  				$$scope: { ctx }
  			}
  		});

  	return {
  		c() {
  			create_component(title_1.$$.fragment);
  			t = space();
  			create_component(content.$$.fragment);
  		},
  		m(target, anchor) {
  			mount_component(title_1, target, anchor);
  			insert(target, t, anchor);
  			mount_component(content, target, anchor);
  			current = true;
  		},
  		p(ctx, dirty) {
  			const title_1_changes = {};

  			if (dirty & /*$$scope*/ 2) {
  				title_1_changes.$$scope = { dirty, ctx };
  			}

  			title_1.$set(title_1_changes);
  			const content_changes = {};

  			if (dirty & /*$$scope*/ 2) {
  				content_changes.$$scope = { dirty, ctx };
  			}

  			content.$set(content_changes);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(title_1.$$.fragment, local);
  			transition_in(content.$$.fragment, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(title_1.$$.fragment, local);
  			transition_out(content.$$.fragment, local);
  			current = false;
  		},
  		d(detaching) {
  			destroy_component(title_1, detaching);
  			if (detaching) detach(t);
  			destroy_component(content, detaching);
  		}
  	};
  }

  // (36:4) <Title>
  function create_default_slot_2(ctx) {
  	let t0;
  	let em;

  	return {
  		c() {
  			t0 = text("Reach out\n      ");
  			em = element("em");
  			em.textContent = "(About the authors)";
  		},
  		m(target, anchor) {
  			insert(target, t0, anchor);
  			insert(target, em, anchor);
  		},
  		d(detaching) {
  			if (detaching) detach(t0);
  			if (detaching) detach(em);
  		}
  	};
  }

  // (40:4) <Content>
  function create_default_slot_1(ctx) {
  	let t0;
  	let ul;

  	return {
  		c() {
  			t0 = text("The team behind this research consists of\n      ");
  			ul = element("ul");

  			ul.innerHTML = `<li>Dr. Vinoo Alluri</li> 
        <li>Dr. Nimmi Rangaswammy</li> 
        <li>Dr. Praveen Parchuri</li> 
        <li>Pratik Kamble</li> 
        <li>Saumya Srivastava</li>`;
  		},
  		m(target, anchor) {
  			insert(target, t0, anchor);
  			insert(target, ul, anchor);
  		},
  		d(detaching) {
  			if (detaching) detach(t0);
  			if (detaching) detach(ul);
  		}
  	};
  }

  // (35:2) <Paper color={'secondary'} elevation={5}>
  function create_default_slot$1(ctx) {
  	let t;
  	let current;

  	const title_1 = new Title$1({
  			props: {
  				$$slots: { default: [create_default_slot_2] },
  				$$scope: { ctx }
  			}
  		});

  	const content = new Content$1({
  			props: {
  				$$slots: { default: [create_default_slot_1] },
  				$$scope: { ctx }
  			}
  		});

  	return {
  		c() {
  			create_component(title_1.$$.fragment);
  			t = space();
  			create_component(content.$$.fragment);
  		},
  		m(target, anchor) {
  			mount_component(title_1, target, anchor);
  			insert(target, t, anchor);
  			mount_component(content, target, anchor);
  			current = true;
  		},
  		p(ctx, dirty) {
  			const title_1_changes = {};

  			if (dirty & /*$$scope*/ 2) {
  				title_1_changes.$$scope = { dirty, ctx };
  			}

  			title_1.$set(title_1_changes);
  			const content_changes = {};

  			if (dirty & /*$$scope*/ 2) {
  				content_changes.$$scope = { dirty, ctx };
  			}

  			content.$set(content_changes);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(title_1.$$.fragment, local);
  			transition_in(content.$$.fragment, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(title_1.$$.fragment, local);
  			transition_out(content.$$.fragment, local);
  			current = false;
  		},
  		d(detaching) {
  			destroy_component(title_1, detaching);
  			if (detaching) detach(t);
  			destroy_component(content, detaching);
  		}
  	};
  }

  function create_fragment$k(ctx) {
  	let title_value;
  	let t0;
  	let div0;
  	let div0_intro;
  	let t1;
  	let div1;
  	let div1_intro;
  	let current;
  	document.title = title_value = /*title*/ ctx[0];

  	const paper0 = new Paper({
  			props: {
  				color: "primary",
  				elevation: 10,
  				$$slots: { default: [create_default_slot_3] },
  				$$scope: { ctx }
  			}
  		});

  	const paper1 = new Paper({
  			props: {
  				color: "secondary",
  				elevation: 5,
  				$$slots: { default: [create_default_slot$1] },
  				$$scope: { ctx }
  			}
  		});

  	return {
  		c() {
  			t0 = space();
  			div0 = element("div");
  			create_component(paper0.$$.fragment);
  			t1 = space();
  			div1 = element("div");
  			create_component(paper1.$$.fragment);
  			attr(div0, "class", "container");
  			attr(div1, "class", "container");
  		},
  		m(target, anchor) {
  			insert(target, t0, anchor);
  			insert(target, div0, anchor);
  			mount_component(paper0, div0, null);
  			insert(target, t1, anchor);
  			insert(target, div1, anchor);
  			mount_component(paper1, div1, null);
  			current = true;
  		},
  		p(ctx, [dirty]) {
  			if ((!current || dirty & /*title*/ 1) && title_value !== (title_value = /*title*/ ctx[0])) {
  				document.title = title_value;
  			}

  			const paper0_changes = {};

  			if (dirty & /*$$scope*/ 2) {
  				paper0_changes.$$scope = { dirty, ctx };
  			}

  			paper0.$set(paper0_changes);
  			const paper1_changes = {};

  			if (dirty & /*$$scope*/ 2) {
  				paper1_changes.$$scope = { dirty, ctx };
  			}

  			paper1.$set(paper1_changes);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(paper0.$$.fragment, local);

  			if (!div0_intro) {
  				add_render_callback(() => {
  					div0_intro = create_in_transition(div0, fade, { duration: 300 });
  					div0_intro.start();
  				});
  			}

  			transition_in(paper1.$$.fragment, local);

  			if (!div1_intro) {
  				add_render_callback(() => {
  					div1_intro = create_in_transition(div1, fade, { duration: 700 });
  					div1_intro.start();
  				});
  			}

  			current = true;
  		},
  		o(local) {
  			transition_out(paper0.$$.fragment, local);
  			transition_out(paper1.$$.fragment, local);
  			current = false;
  		},
  		d(detaching) {
  			if (detaching) detach(t0);
  			if (detaching) detach(div0);
  			destroy_component(paper0);
  			if (detaching) detach(t1);
  			if (detaching) detach(div1);
  			destroy_component(paper1);
  		}
  	};
  }

  function instance$k($$self, $$props, $$invalidate) {
  	const title = "Introduction";
  	return [title];
  }

  class Home extends SvelteComponent {
  	constructor(options) {
  		super();
  		init(this, options, instance$k, create_fragment$k, safe_not_equal, { title: 0 });
  	}

  	get title() {
  		return this.$$.ctx[0];
  	}
  }

  /* src/routes/Renumeration.svelte generated by Svelte v3.18.1 */

  function create_default_slot_3$1(ctx) {
  	let t;

  	return {
  		c() {
  			t = text("Renumeration");
  		},
  		m(target, anchor) {
  			insert(target, t, anchor);
  		},
  		d(detaching) {
  			if (detaching) detach(t);
  		}
  	};
  }

  // (19:6) <Subtitle>
  function create_default_slot_2$1(ctx) {
  	let t;

  	return {
  		c() {
  			t = text("Raffle Token System");
  		},
  		m(target, anchor) {
  			insert(target, t, anchor);
  		},
  		d(detaching) {
  			if (detaching) detach(t);
  		}
  	};
  }

  // (10:4) <Content>
  function create_default_slot_1$1(ctx) {
  	let p0;
  	let t0;
  	let a;
  	let link_action;
  	let t2;
  	let t3;
  	let t4;
  	let p1;
  	let current;
  	let dispose;

  	const subtitle = new Subtitle$1({
  			props: {
  				$$slots: { default: [create_default_slot_2$1] },
  				$$scope: { ctx }
  			}
  		});

  	return {
  		c() {
  			p0 = element("p");
  			t0 = text("All participants of the anonymous questionnaire will be renumerated for\n        their time invested. Read the about sections of each questionnaire for\n        further details. (PS - Read the\n        ");
  			a = element("a");
  			a.textContent = "privacy section";
  			t2 = text("\n        is maintained even though remuneration will be carried out for every\n        valid participant)");
  			t3 = space();
  			create_component(subtitle.$$.fragment);
  			t4 = space();
  			p1 = element("p");
  			p1.textContent = "The raffle token system exists to motivate people to fill in the entire\n        research dataset and moreover, highlight the secureness of the\n        anonymization (gone into more detail in the privacy section). In\n        essence, if any of the questionnaires are filled in full (indicated by\n        number of tickets on your dashboard), you are automatically entered into\n        a large scale Amazon/Sponsor raffle draw for a gift voucher. Remeber,\n        this is in addition to the individual renumeration you get for each\n        questionnaire.";
  			attr(a, "href", "/privacy");
  		},
  		m(target, anchor) {
  			insert(target, p0, anchor);
  			append(p0, t0);
  			append(p0, a);
  			append(p0, t2);
  			insert(target, t3, anchor);
  			mount_component(subtitle, target, anchor);
  			insert(target, t4, anchor);
  			insert(target, p1, anchor);
  			current = true;
  			dispose = action_destroyer(link_action = link.call(null, a));
  		},
  		p(ctx, dirty) {
  			const subtitle_changes = {};

  			if (dirty & /*$$scope*/ 1) {
  				subtitle_changes.$$scope = { dirty, ctx };
  			}

  			subtitle.$set(subtitle_changes);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(subtitle.$$.fragment, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(subtitle.$$.fragment, local);
  			current = false;
  		},
  		d(detaching) {
  			if (detaching) detach(p0);
  			if (detaching) detach(t3);
  			destroy_component(subtitle, detaching);
  			if (detaching) detach(t4);
  			if (detaching) detach(p1);
  			dispose();
  		}
  	};
  }

  // (8:2) <Paper color={'default'} elevation={10}>
  function create_default_slot$2(ctx) {
  	let t;
  	let current;

  	const title = new Title$1({
  			props: {
  				$$slots: { default: [create_default_slot_3$1] },
  				$$scope: { ctx }
  			}
  		});

  	const content = new Content$1({
  			props: {
  				$$slots: { default: [create_default_slot_1$1] },
  				$$scope: { ctx }
  			}
  		});

  	return {
  		c() {
  			create_component(title.$$.fragment);
  			t = space();
  			create_component(content.$$.fragment);
  		},
  		m(target, anchor) {
  			mount_component(title, target, anchor);
  			insert(target, t, anchor);
  			mount_component(content, target, anchor);
  			current = true;
  		},
  		p(ctx, dirty) {
  			const title_changes = {};

  			if (dirty & /*$$scope*/ 1) {
  				title_changes.$$scope = { dirty, ctx };
  			}

  			title.$set(title_changes);
  			const content_changes = {};

  			if (dirty & /*$$scope*/ 1) {
  				content_changes.$$scope = { dirty, ctx };
  			}

  			content.$set(content_changes);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(title.$$.fragment, local);
  			transition_in(content.$$.fragment, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(title.$$.fragment, local);
  			transition_out(content.$$.fragment, local);
  			current = false;
  		},
  		d(detaching) {
  			destroy_component(title, detaching);
  			if (detaching) detach(t);
  			destroy_component(content, detaching);
  		}
  	};
  }

  function create_fragment$l(ctx) {
  	let div;
  	let div_intro;
  	let current;

  	const paper = new Paper({
  			props: {
  				color: "default",
  				elevation: 10,
  				$$slots: { default: [create_default_slot$2] },
  				$$scope: { ctx }
  			}
  		});

  	return {
  		c() {
  			div = element("div");
  			create_component(paper.$$.fragment);
  			attr(div, "class", "card-container long");
  		},
  		m(target, anchor) {
  			insert(target, div, anchor);
  			mount_component(paper, div, null);
  			current = true;
  		},
  		p(ctx, [dirty]) {
  			const paper_changes = {};

  			if (dirty & /*$$scope*/ 1) {
  				paper_changes.$$scope = { dirty, ctx };
  			}

  			paper.$set(paper_changes);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(paper.$$.fragment, local);

  			if (!div_intro) {
  				add_render_callback(() => {
  					div_intro = create_in_transition(div, fade, { duration: 500 });
  					div_intro.start();
  				});
  			}

  			current = true;
  		},
  		o(local) {
  			transition_out(paper.$$.fragment, local);
  			current = false;
  		},
  		d(detaching) {
  			if (detaching) detach(div);
  			destroy_component(paper);
  		}
  	};
  }

  class Renumeration extends SvelteComponent {
  	constructor(options) {
  		super();
  		init(this, options, null, create_fragment$l, safe_not_equal, {});
  	}
  }

  /* src/routes/Privacy.svelte generated by Svelte v3.18.1 */

  function create_default_slot_5$1(ctx) {
  	let t;

  	return {
  		c() {
  			t = text("Privacy");
  		},
  		m(target, anchor) {
  			insert(target, t, anchor);
  		},
  		d(detaching) {
  			if (detaching) detach(t);
  		}
  	};
  }

  // (18:6) <Subtitle>
  function create_default_slot_4$1(ctx) {
  	let t;

  	return {
  		c() {
  			t = text("Searching and Querying");
  		},
  		m(target, anchor) {
  			insert(target, t, anchor);
  		},
  		d(detaching) {
  			if (detaching) detach(t);
  		}
  	};
  }

  // (27:6) <Subtitle>
  function create_default_slot_3$2(ctx) {
  	let t;

  	return {
  		c() {
  			t = text("Analysis");
  		},
  		m(target, anchor) {
  			insert(target, t, anchor);
  		},
  		d(detaching) {
  			if (detaching) detach(t);
  		}
  	};
  }

  // (35:6) <Subtitle>
  function create_default_slot_2$2(ctx) {
  	let t;

  	return {
  		c() {
  			t = text("Raffle System");
  		},
  		m(target, anchor) {
  			insert(target, t, anchor);
  		},
  		d(detaching) {
  			if (detaching) detach(t);
  		}
  	};
  }

  // (10:4) <Content>
  function create_default_slot_1$2(ctx) {
  	let p0;
  	let t1;
  	let t2;
  	let p1;
  	let t4;
  	let t5;
  	let p2;
  	let t7;
  	let t8;
  	let p3;
  	let t9;
  	let a;
  	let link_action;
  	let t11;
  	let current;
  	let dispose;

  	const subtitle0 = new Subtitle$1({
  			props: {
  				$$slots: { default: [create_default_slot_4$1] },
  				$$scope: { ctx }
  			}
  		});

  	const subtitle1 = new Subtitle$1({
  			props: {
  				$$slots: { default: [create_default_slot_3$2] },
  				$$scope: { ctx }
  			}
  		});

  	const subtitle2 = new Subtitle$1({
  			props: {
  				$$slots: { default: [create_default_slot_2$2] },
  				$$scope: { ctx }
  			}
  		});

  	return {
  		c() {
  			p0 = element("p");
  			p0.textContent = "All data that is collected through the questionnaires is anonymized\n        using a simple hashing technique over LDAP. When you log in to the\n        platform using CAS, your sambaSID (a unique ID for each student) is\n        hashed and logged into the database as your identity. This is now your\n        reference for any activity on the site.";
  			t1 = space();
  			create_component(subtitle0.$$.fragment);
  			t2 = space();
  			p1 = element("p");
  			p1.textContent = "For the interpersonal questionnaire, you will be asked to fill out\n        certain questions about the support structure around you. For this, to\n        maintain anonymity, a search can be performed over the public LDAP\n        (college-private “telephone” booth) for the relevant sambaSID of the\n        other user and will, again be hashed and stored as the network\n        connectivity from you to the other nodes.";
  			t4 = space();
  			create_component(subtitle1.$$.fragment);
  			t5 = space();
  			p2 = element("p");
  			p2.textContent = "Once the target sample size has been reached, the hashed network from\n        the database will be salted and subjected to further analysis. At this\n        point, the entire network will be visualized on the site for public\n        access and viewing. Further analysis of trends and topography would be\n        made available as and when it has been performed.";
  			t7 = space();
  			create_component(subtitle2.$$.fragment);
  			t8 = space();
  			p3 = element("p");
  			t9 = text("When each user logs in to the system for the first time, he is presented\n        with a prompt to choose a unique nickname (either his own or a randomly\n        generated one). This nickname will be mapped to the hashed ID and used\n        for later reference (by you) to collect your total\n        ");
  			a = element("a");
  			a.textContent = "remuneration";
  			t11 = text("\n        (including, potential Amazon gift voucher).");
  			attr(a, "href", "/renumeration");
  		},
  		m(target, anchor) {
  			insert(target, p0, anchor);
  			insert(target, t1, anchor);
  			mount_component(subtitle0, target, anchor);
  			insert(target, t2, anchor);
  			insert(target, p1, anchor);
  			insert(target, t4, anchor);
  			mount_component(subtitle1, target, anchor);
  			insert(target, t5, anchor);
  			insert(target, p2, anchor);
  			insert(target, t7, anchor);
  			mount_component(subtitle2, target, anchor);
  			insert(target, t8, anchor);
  			insert(target, p3, anchor);
  			append(p3, t9);
  			append(p3, a);
  			append(p3, t11);
  			current = true;
  			dispose = action_destroyer(link_action = link.call(null, a));
  		},
  		p(ctx, dirty) {
  			const subtitle0_changes = {};

  			if (dirty & /*$$scope*/ 1) {
  				subtitle0_changes.$$scope = { dirty, ctx };
  			}

  			subtitle0.$set(subtitle0_changes);
  			const subtitle1_changes = {};

  			if (dirty & /*$$scope*/ 1) {
  				subtitle1_changes.$$scope = { dirty, ctx };
  			}

  			subtitle1.$set(subtitle1_changes);
  			const subtitle2_changes = {};

  			if (dirty & /*$$scope*/ 1) {
  				subtitle2_changes.$$scope = { dirty, ctx };
  			}

  			subtitle2.$set(subtitle2_changes);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(subtitle0.$$.fragment, local);
  			transition_in(subtitle1.$$.fragment, local);
  			transition_in(subtitle2.$$.fragment, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(subtitle0.$$.fragment, local);
  			transition_out(subtitle1.$$.fragment, local);
  			transition_out(subtitle2.$$.fragment, local);
  			current = false;
  		},
  		d(detaching) {
  			if (detaching) detach(p0);
  			if (detaching) detach(t1);
  			destroy_component(subtitle0, detaching);
  			if (detaching) detach(t2);
  			if (detaching) detach(p1);
  			if (detaching) detach(t4);
  			destroy_component(subtitle1, detaching);
  			if (detaching) detach(t5);
  			if (detaching) detach(p2);
  			if (detaching) detach(t7);
  			destroy_component(subtitle2, detaching);
  			if (detaching) detach(t8);
  			if (detaching) detach(p3);
  			dispose();
  		}
  	};
  }

  // (8:2) <Paper color={'secondary'} elevation={10}>
  function create_default_slot$3(ctx) {
  	let t;
  	let current;

  	const title = new Title$1({
  			props: {
  				$$slots: { default: [create_default_slot_5$1] },
  				$$scope: { ctx }
  			}
  		});

  	const content = new Content$1({
  			props: {
  				$$slots: { default: [create_default_slot_1$2] },
  				$$scope: { ctx }
  			}
  		});

  	return {
  		c() {
  			create_component(title.$$.fragment);
  			t = space();
  			create_component(content.$$.fragment);
  		},
  		m(target, anchor) {
  			mount_component(title, target, anchor);
  			insert(target, t, anchor);
  			mount_component(content, target, anchor);
  			current = true;
  		},
  		p(ctx, dirty) {
  			const title_changes = {};

  			if (dirty & /*$$scope*/ 1) {
  				title_changes.$$scope = { dirty, ctx };
  			}

  			title.$set(title_changes);
  			const content_changes = {};

  			if (dirty & /*$$scope*/ 1) {
  				content_changes.$$scope = { dirty, ctx };
  			}

  			content.$set(content_changes);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(title.$$.fragment, local);
  			transition_in(content.$$.fragment, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(title.$$.fragment, local);
  			transition_out(content.$$.fragment, local);
  			current = false;
  		},
  		d(detaching) {
  			destroy_component(title, detaching);
  			if (detaching) detach(t);
  			destroy_component(content, detaching);
  		}
  	};
  }

  function create_fragment$m(ctx) {
  	let div;
  	let div_intro;
  	let current;

  	const paper = new Paper({
  			props: {
  				color: "secondary",
  				elevation: 10,
  				$$slots: { default: [create_default_slot$3] },
  				$$scope: { ctx }
  			}
  		});

  	return {
  		c() {
  			div = element("div");
  			create_component(paper.$$.fragment);
  			attr(div, "class", "card-container long");
  		},
  		m(target, anchor) {
  			insert(target, div, anchor);
  			mount_component(paper, div, null);
  			current = true;
  		},
  		p(ctx, [dirty]) {
  			const paper_changes = {};

  			if (dirty & /*$$scope*/ 1) {
  				paper_changes.$$scope = { dirty, ctx };
  			}

  			paper.$set(paper_changes);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(paper.$$.fragment, local);

  			if (!div_intro) {
  				add_render_callback(() => {
  					div_intro = create_in_transition(div, fade, { duration: 500 });
  					div_intro.start();
  				});
  			}

  			current = true;
  		},
  		o(local) {
  			transition_out(paper.$$.fragment, local);
  			current = false;
  		},
  		d(detaching) {
  			if (detaching) detach(div);
  			destroy_component(paper);
  		}
  	};
  }

  class Privacy extends SvelteComponent {
  	constructor(options) {
  		super();
  		init(this, options, null, create_fragment$m, safe_not_equal, {});
  	}
  }

  /* src/routes/Regex.svelte generated by Svelte v3.18.1 */

  function create_fragment$n(ctx) {
  	let h2;
  	let t1;
  	let p;
  	let t2;
  	let code;
  	let t3_value = JSON.stringify(/*params*/ ctx[0]) + "";
  	let t3;

  	return {
  		c() {
  			h2 = element("h2");
  			h2.textContent = "Regex route";
  			t1 = space();
  			p = element("p");
  			t2 = text("Match is: ");
  			code = element("code");
  			t3 = text(t3_value);
  			attr(h2, "class", "routetitle");
  			attr(code, "id", "regexmatch");
  		},
  		m(target, anchor) {
  			insert(target, h2, anchor);
  			insert(target, t1, anchor);
  			insert(target, p, anchor);
  			append(p, t2);
  			append(p, code);
  			append(code, t3);
  		},
  		p(ctx, [dirty]) {
  			if (dirty & /*params*/ 1 && t3_value !== (t3_value = JSON.stringify(/*params*/ ctx[0]) + "")) set_data(t3, t3_value);
  		},
  		i: noop,
  		o: noop,
  		d(detaching) {
  			if (detaching) detach(h2);
  			if (detaching) detach(t1);
  			if (detaching) detach(p);
  		}
  	};
  }

  function instance$l($$self, $$props, $$invalidate) {
  	let { params = {} } = $$props;

  	$$self.$set = $$props => {
  		if ("params" in $$props) $$invalidate(0, params = $$props.params);
  	};

  	return [params];
  }

  class Regex extends SvelteComponent {
  	constructor(options) {
  		super();
  		init(this, options, instance$l, create_fragment$n, safe_not_equal, { params: 0 });
  	}
  }

  /* src/routes/Intra.svelte generated by Svelte v3.18.1 */

  function create_default_slot_2$3(ctx) {
  	let t;

  	return {
  		c() {
  			t = text("Intrapersonal Questionnaires");
  		},
  		m(target, anchor) {
  			insert(target, t, anchor);
  		},
  		d(detaching) {
  			if (detaching) detach(t);
  		}
  	};
  }

  // (9:4) <Content>
  function create_default_slot_1$3(ctx) {
  	let t;

  	return {
  		c() {
  			t = text("Intrapersonal questionnaires are responsible for adding intrinsic value to\n      each node. The questionnaires are quantized into various metrics\n      (mentioned below) and used to assign a score vector to each node, an\n      embedding, of sorts.");
  		},
  		m(target, anchor) {
  			insert(target, t, anchor);
  		},
  		d(detaching) {
  			if (detaching) detach(t);
  		}
  	};
  }

  // (7:2) <Paper color={'primary'} elevation={10}>
  function create_default_slot$4(ctx) {
  	let t;
  	let current;

  	const title = new Title$1({
  			props: {
  				$$slots: { default: [create_default_slot_2$3] },
  				$$scope: { ctx }
  			}
  		});

  	const content = new Content$1({
  			props: {
  				$$slots: { default: [create_default_slot_1$3] },
  				$$scope: { ctx }
  			}
  		});

  	return {
  		c() {
  			create_component(title.$$.fragment);
  			t = space();
  			create_component(content.$$.fragment);
  		},
  		m(target, anchor) {
  			mount_component(title, target, anchor);
  			insert(target, t, anchor);
  			mount_component(content, target, anchor);
  			current = true;
  		},
  		p(ctx, dirty) {
  			const title_changes = {};

  			if (dirty & /*$$scope*/ 1) {
  				title_changes.$$scope = { dirty, ctx };
  			}

  			title.$set(title_changes);
  			const content_changes = {};

  			if (dirty & /*$$scope*/ 1) {
  				content_changes.$$scope = { dirty, ctx };
  			}

  			content.$set(content_changes);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(title.$$.fragment, local);
  			transition_in(content.$$.fragment, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(title.$$.fragment, local);
  			transition_out(content.$$.fragment, local);
  			current = false;
  		},
  		d(detaching) {
  			destroy_component(title, detaching);
  			if (detaching) detach(t);
  			destroy_component(content, detaching);
  		}
  	};
  }

  function create_fragment$o(ctx) {
  	let div;
  	let div_intro;
  	let current;

  	const paper = new Paper({
  			props: {
  				color: "primary",
  				elevation: 10,
  				$$slots: { default: [create_default_slot$4] },
  				$$scope: { ctx }
  			}
  		});

  	return {
  		c() {
  			div = element("div");
  			create_component(paper.$$.fragment);
  			attr(div, "class", "card-container long");
  		},
  		m(target, anchor) {
  			insert(target, div, anchor);
  			mount_component(paper, div, null);
  			current = true;
  		},
  		p(ctx, [dirty]) {
  			const paper_changes = {};

  			if (dirty & /*$$scope*/ 1) {
  				paper_changes.$$scope = { dirty, ctx };
  			}

  			paper.$set(paper_changes);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(paper.$$.fragment, local);

  			if (!div_intro) {
  				add_render_callback(() => {
  					div_intro = create_in_transition(div, fade, { duration: 500 });
  					div_intro.start();
  				});
  			}

  			current = true;
  		},
  		o(local) {
  			transition_out(paper.$$.fragment, local);
  			current = false;
  		},
  		d(detaching) {
  			if (detaching) detach(div);
  			destroy_component(paper);
  		}
  	};
  }

  class Intra extends SvelteComponent {
  	constructor(options) {
  		super();
  		init(this, options, null, create_fragment$o, safe_not_equal, {});
  	}
  }

  /* src/routes/Inter.svelte generated by Svelte v3.18.1 */

  function create_default_slot_2$4(ctx) {
  	let t;

  	return {
  		c() {
  			t = text("Interpersonal Questionnaires");
  		},
  		m(target, anchor) {
  			insert(target, t, anchor);
  		},
  		d(detaching) {
  			if (detaching) detach(t);
  		}
  	};
  }

  // (9:4) <Content>
  function create_default_slot_1$4(ctx) {
  	let t;

  	return {
  		c() {
  			t = text("The interpersonal questionnaire is responsible for modeling edges in a\n      directed, weighted fashion. Think of it like node ABC having filled\n      Question 3 choosing node PQR as option C (refer to the intrapersonal\n      section for more information). A basic representation would be like the\n      following:");
  		},
  		m(target, anchor) {
  			insert(target, t, anchor);
  		},
  		d(detaching) {
  			if (detaching) detach(t);
  		}
  	};
  }

  // (7:2) <Paper color={'primary'} elevation={10}>
  function create_default_slot$5(ctx) {
  	let t;
  	let current;

  	const title = new Title$1({
  			props: {
  				$$slots: { default: [create_default_slot_2$4] },
  				$$scope: { ctx }
  			}
  		});

  	const content = new Content$1({
  			props: {
  				$$slots: { default: [create_default_slot_1$4] },
  				$$scope: { ctx }
  			}
  		});

  	return {
  		c() {
  			create_component(title.$$.fragment);
  			t = space();
  			create_component(content.$$.fragment);
  		},
  		m(target, anchor) {
  			mount_component(title, target, anchor);
  			insert(target, t, anchor);
  			mount_component(content, target, anchor);
  			current = true;
  		},
  		p(ctx, dirty) {
  			const title_changes = {};

  			if (dirty & /*$$scope*/ 1) {
  				title_changes.$$scope = { dirty, ctx };
  			}

  			title.$set(title_changes);
  			const content_changes = {};

  			if (dirty & /*$$scope*/ 1) {
  				content_changes.$$scope = { dirty, ctx };
  			}

  			content.$set(content_changes);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(title.$$.fragment, local);
  			transition_in(content.$$.fragment, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(title.$$.fragment, local);
  			transition_out(content.$$.fragment, local);
  			current = false;
  		},
  		d(detaching) {
  			destroy_component(title, detaching);
  			if (detaching) detach(t);
  			destroy_component(content, detaching);
  		}
  	};
  }

  function create_fragment$p(ctx) {
  	let div;
  	let div_intro;
  	let current;

  	const paper = new Paper({
  			props: {
  				color: "primary",
  				elevation: 10,
  				$$slots: { default: [create_default_slot$5] },
  				$$scope: { ctx }
  			}
  		});

  	return {
  		c() {
  			div = element("div");
  			create_component(paper.$$.fragment);
  			attr(div, "class", "card-container long");
  		},
  		m(target, anchor) {
  			insert(target, div, anchor);
  			mount_component(paper, div, null);
  			current = true;
  		},
  		p(ctx, [dirty]) {
  			const paper_changes = {};

  			if (dirty & /*$$scope*/ 1) {
  				paper_changes.$$scope = { dirty, ctx };
  			}

  			paper.$set(paper_changes);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(paper.$$.fragment, local);

  			if (!div_intro) {
  				add_render_callback(() => {
  					div_intro = create_in_transition(div, fade, { duration: 500 });
  					div_intro.start();
  				});
  			}

  			current = true;
  		},
  		o(local) {
  			transition_out(paper.$$.fragment, local);
  			current = false;
  		},
  		d(detaching) {
  			if (detaching) detach(div);
  			destroy_component(paper);
  		}
  	};
  }

  class Inter extends SvelteComponent {
  	constructor(options) {
  		super();
  		init(this, options, null, create_fragment$p, safe_not_equal, {});
  	}
  }

  /* node_modules/@smui/common/Button.svelte generated by Svelte v3.18.1 */

  function create_fragment$q(ctx) {
  	let button;
  	let useActions_action;
  	let forwardEvents_action;
  	let current;
  	let dispose;
  	const default_slot_template = /*$$slots*/ ctx[4].default;
  	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[3], null);
  	let button_levels = [exclude(/*$$props*/ ctx[2], ["use"])];
  	let button_data = {};

  	for (let i = 0; i < button_levels.length; i += 1) {
  		button_data = assign(button_data, button_levels[i]);
  	}

  	return {
  		c() {
  			button = element("button");
  			if (default_slot) default_slot.c();
  			set_attributes(button, button_data);
  		},
  		m(target, anchor) {
  			insert(target, button, anchor);

  			if (default_slot) {
  				default_slot.m(button, null);
  			}

  			current = true;

  			dispose = [
  				action_destroyer(useActions_action = useActions.call(null, button, /*use*/ ctx[0])),
  				action_destroyer(forwardEvents_action = /*forwardEvents*/ ctx[1].call(null, button))
  			];
  		},
  		p(ctx, [dirty]) {
  			if (default_slot && default_slot.p && dirty & /*$$scope*/ 8) {
  				default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[3], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[3], dirty, null));
  			}

  			set_attributes(button, get_spread_update(button_levels, [dirty & /*exclude, $$props*/ 4 && exclude(/*$$props*/ ctx[2], ["use"])]));
  			if (useActions_action && is_function(useActions_action.update) && dirty & /*use*/ 1) useActions_action.update.call(null, /*use*/ ctx[0]);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(default_slot, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(default_slot, local);
  			current = false;
  		},
  		d(detaching) {
  			if (detaching) detach(button);
  			if (default_slot) default_slot.d(detaching);
  			run_all(dispose);
  		}
  	};
  }

  function instance$m($$self, $$props, $$invalidate) {
  	const forwardEvents = forwardEventsBuilder(current_component);
  	let { use = [] } = $$props;
  	let { $$slots = {}, $$scope } = $$props;

  	$$self.$set = $$new_props => {
  		$$invalidate(2, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
  		if ("use" in $$new_props) $$invalidate(0, use = $$new_props.use);
  		if ("$$scope" in $$new_props) $$invalidate(3, $$scope = $$new_props.$$scope);
  	};

  	$$props = exclude_internal_props($$props);
  	return [use, forwardEvents, $$props, $$scope, $$slots];
  }

  class Button extends SvelteComponent {
  	constructor(options) {
  		super();
  		init(this, options, instance$m, create_fragment$q, safe_not_equal, { use: 0 });
  	}
  }

  /* node_modules/@smui/button/Button.svelte generated by Svelte v3.18.1 */

  function create_default_slot$6(ctx) {
  	let current;
  	const default_slot_template = /*$$slots*/ ctx[17].default;
  	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[19], null);

  	return {
  		c() {
  			if (default_slot) default_slot.c();
  		},
  		m(target, anchor) {
  			if (default_slot) {
  				default_slot.m(target, anchor);
  			}

  			current = true;
  		},
  		p(ctx, dirty) {
  			if (default_slot && default_slot.p && dirty & /*$$scope*/ 524288) {
  				default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[19], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[19], dirty, null));
  			}
  		},
  		i(local) {
  			if (current) return;
  			transition_in(default_slot, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(default_slot, local);
  			current = false;
  		},
  		d(detaching) {
  			if (default_slot) default_slot.d(detaching);
  		}
  	};
  }

  function create_fragment$r(ctx) {
  	let switch_instance_anchor;
  	let current;

  	const switch_instance_spread_levels = [
  		{
  			use: [
  				[
  					Ripple,
  					{
  						ripple: /*ripple*/ ctx[2],
  						unbounded: false,
  						classForward: /*func*/ ctx[18]
  					}
  				],
  				/*forwardEvents*/ ctx[11],
  				.../*use*/ ctx[0]
  			]
  		},
  		{
  			class: "\n    mdc-button\n    " + /*className*/ ctx[1] + "\n    " + /*rippleClasses*/ ctx[7].join(" ") + "\n    " + (/*variant*/ ctx[4] === "raised"
  			? "mdc-button--raised"
  			: "") + "\n    " + (/*variant*/ ctx[4] === "unelevated"
  			? "mdc-button--unelevated"
  			: "") + "\n    " + (/*variant*/ ctx[4] === "outlined"
  			? "mdc-button--outlined"
  			: "") + "\n    " + (/*dense*/ ctx[5] ? "mdc-button--dense" : "") + "\n    " + (/*color*/ ctx[3] === "secondary"
  			? "smui-button--color-secondary"
  			: "") + "\n    " + (/*context*/ ctx[12] === "card:action"
  			? "mdc-card__action"
  			: "") + "\n    " + (/*context*/ ctx[12] === "card:action"
  			? "mdc-card__action--button"
  			: "") + "\n    " + (/*context*/ ctx[12] === "dialog:action"
  			? "mdc-dialog__button"
  			: "") + "\n    " + (/*context*/ ctx[12] === "top-app-bar:navigation"
  			? "mdc-top-app-bar__navigation-icon"
  			: "") + "\n    " + (/*context*/ ctx[12] === "top-app-bar:action"
  			? "mdc-top-app-bar__action-item"
  			: "") + "\n    " + (/*context*/ ctx[12] === "snackbar"
  			? "mdc-snackbar__action"
  			: "") + "\n  "
  		},
  		/*actionProp*/ ctx[9],
  		/*defaultProp*/ ctx[10],
  		exclude(/*$$props*/ ctx[13], [
  			"use",
  			"class",
  			"ripple",
  			"color",
  			"variant",
  			"dense",
  			.../*dialogExcludes*/ ctx[8]
  		])
  	];

  	var switch_value = /*component*/ ctx[6];

  	function switch_props(ctx) {
  		let switch_instance_props = {
  			$$slots: { default: [create_default_slot$6] },
  			$$scope: { ctx }
  		};

  		for (let i = 0; i < switch_instance_spread_levels.length; i += 1) {
  			switch_instance_props = assign(switch_instance_props, switch_instance_spread_levels[i]);
  		}

  		return { props: switch_instance_props };
  	}

  	if (switch_value) {
  		var switch_instance = new switch_value(switch_props(ctx));
  	}

  	return {
  		c() {
  			if (switch_instance) create_component(switch_instance.$$.fragment);
  			switch_instance_anchor = empty();
  		},
  		m(target, anchor) {
  			if (switch_instance) {
  				mount_component(switch_instance, target, anchor);
  			}

  			insert(target, switch_instance_anchor, anchor);
  			current = true;
  		},
  		p(ctx, [dirty]) {
  			const switch_instance_changes = (dirty & /*Ripple, ripple, rippleClasses, forwardEvents, use, className, variant, dense, color, context, actionProp, defaultProp, exclude, $$props, dialogExcludes*/ 16319)
  			? get_spread_update(switch_instance_spread_levels, [
  					dirty & /*Ripple, ripple, rippleClasses, forwardEvents, use*/ 2181 && {
  						use: [
  							[
  								Ripple,
  								{
  									ripple: /*ripple*/ ctx[2],
  									unbounded: false,
  									classForward: /*func*/ ctx[18]
  								}
  							],
  							/*forwardEvents*/ ctx[11],
  							.../*use*/ ctx[0]
  						]
  					},
  					dirty & /*className, rippleClasses, variant, dense, color, context*/ 4282 && {
  						class: "\n    mdc-button\n    " + /*className*/ ctx[1] + "\n    " + /*rippleClasses*/ ctx[7].join(" ") + "\n    " + (/*variant*/ ctx[4] === "raised"
  						? "mdc-button--raised"
  						: "") + "\n    " + (/*variant*/ ctx[4] === "unelevated"
  						? "mdc-button--unelevated"
  						: "") + "\n    " + (/*variant*/ ctx[4] === "outlined"
  						? "mdc-button--outlined"
  						: "") + "\n    " + (/*dense*/ ctx[5] ? "mdc-button--dense" : "") + "\n    " + (/*color*/ ctx[3] === "secondary"
  						? "smui-button--color-secondary"
  						: "") + "\n    " + (/*context*/ ctx[12] === "card:action"
  						? "mdc-card__action"
  						: "") + "\n    " + (/*context*/ ctx[12] === "card:action"
  						? "mdc-card__action--button"
  						: "") + "\n    " + (/*context*/ ctx[12] === "dialog:action"
  						? "mdc-dialog__button"
  						: "") + "\n    " + (/*context*/ ctx[12] === "top-app-bar:navigation"
  						? "mdc-top-app-bar__navigation-icon"
  						: "") + "\n    " + (/*context*/ ctx[12] === "top-app-bar:action"
  						? "mdc-top-app-bar__action-item"
  						: "") + "\n    " + (/*context*/ ctx[12] === "snackbar"
  						? "mdc-snackbar__action"
  						: "") + "\n  "
  					},
  					dirty & /*actionProp*/ 512 && get_spread_object(/*actionProp*/ ctx[9]),
  					dirty & /*defaultProp*/ 1024 && get_spread_object(/*defaultProp*/ ctx[10]),
  					dirty & /*exclude, $$props, dialogExcludes*/ 8448 && get_spread_object(exclude(/*$$props*/ ctx[13], [
  						"use",
  						"class",
  						"ripple",
  						"color",
  						"variant",
  						"dense",
  						.../*dialogExcludes*/ ctx[8]
  					]))
  				])
  			: {};

  			if (dirty & /*$$scope*/ 524288) {
  				switch_instance_changes.$$scope = { dirty, ctx };
  			}

  			if (switch_value !== (switch_value = /*component*/ ctx[6])) {
  				if (switch_instance) {
  					group_outros();
  					const old_component = switch_instance;

  					transition_out(old_component.$$.fragment, 1, 0, () => {
  						destroy_component(old_component, 1);
  					});

  					check_outros();
  				}

  				if (switch_value) {
  					switch_instance = new switch_value(switch_props(ctx));
  					create_component(switch_instance.$$.fragment);
  					transition_in(switch_instance.$$.fragment, 1);
  					mount_component(switch_instance, switch_instance_anchor.parentNode, switch_instance_anchor);
  				} else {
  					switch_instance = null;
  				}
  			} else if (switch_value) {
  				switch_instance.$set(switch_instance_changes);
  			}
  		},
  		i(local) {
  			if (current) return;
  			if (switch_instance) transition_in(switch_instance.$$.fragment, local);
  			current = true;
  		},
  		o(local) {
  			if (switch_instance) transition_out(switch_instance.$$.fragment, local);
  			current = false;
  		},
  		d(detaching) {
  			if (detaching) detach(switch_instance_anchor);
  			if (switch_instance) destroy_component(switch_instance, detaching);
  		}
  	};
  }

  function instance$n($$self, $$props, $$invalidate) {
  	const forwardEvents = forwardEventsBuilder(current_component);
  	let { use = [] } = $$props;
  	let { class: className = "" } = $$props;
  	let { ripple = true } = $$props;
  	let { color = "primary" } = $$props;
  	let { variant = "text" } = $$props;
  	let { dense = false } = $$props;
  	let { href = null } = $$props;
  	let { action = "close" } = $$props;
  	let { default: defaultAction = false } = $$props;
  	let { component = href == null ? Button : A } = $$props;
  	let context = getContext("SMUI:button:context");
  	let rippleClasses = [];
  	setContext("SMUI:label:context", "button");
  	setContext("SMUI:icon:context", "button");
  	let { $$slots = {}, $$scope } = $$props;
  	const func = classes => $$invalidate(7, rippleClasses = classes);

  	$$self.$set = $$new_props => {
  		$$invalidate(13, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
  		if ("use" in $$new_props) $$invalidate(0, use = $$new_props.use);
  		if ("class" in $$new_props) $$invalidate(1, className = $$new_props.class);
  		if ("ripple" in $$new_props) $$invalidate(2, ripple = $$new_props.ripple);
  		if ("color" in $$new_props) $$invalidate(3, color = $$new_props.color);
  		if ("variant" in $$new_props) $$invalidate(4, variant = $$new_props.variant);
  		if ("dense" in $$new_props) $$invalidate(5, dense = $$new_props.dense);
  		if ("href" in $$new_props) $$invalidate(14, href = $$new_props.href);
  		if ("action" in $$new_props) $$invalidate(15, action = $$new_props.action);
  		if ("default" in $$new_props) $$invalidate(16, defaultAction = $$new_props.default);
  		if ("component" in $$new_props) $$invalidate(6, component = $$new_props.component);
  		if ("$$scope" in $$new_props) $$invalidate(19, $$scope = $$new_props.$$scope);
  	};

  	let dialogExcludes;
  	let actionProp;
  	let defaultProp;

  	$$self.$$.update = () => {
  		if ($$self.$$.dirty & /*action*/ 32768) {
  			 $$invalidate(9, actionProp = context === "dialog:action" && action !== null
  			? { "data-mdc-dialog-action": action }
  			: {});
  		}

  		if ($$self.$$.dirty & /*defaultAction*/ 65536) {
  			 $$invalidate(10, defaultProp = context === "dialog:action" && defaultAction
  			? { "data-mdc-dialog-button-default": "" }
  			: {});
  		}
  	};

  	 $$invalidate(8, dialogExcludes = context === "dialog:action" ? ["action", "default"] : []);
  	$$props = exclude_internal_props($$props);

  	return [
  		use,
  		className,
  		ripple,
  		color,
  		variant,
  		dense,
  		component,
  		rippleClasses,
  		dialogExcludes,
  		actionProp,
  		defaultProp,
  		forwardEvents,
  		context,
  		$$props,
  		href,
  		action,
  		defaultAction,
  		$$slots,
  		func,
  		$$scope
  	];
  }

  class Button_1 extends SvelteComponent {
  	constructor(options) {
  		super();

  		init(this, options, instance$n, create_fragment$r, safe_not_equal, {
  			use: 0,
  			class: 1,
  			ripple: 2,
  			color: 3,
  			variant: 4,
  			dense: 5,
  			href: 14,
  			action: 15,
  			default: 16,
  			component: 6
  		});
  	}
  }

  /* node_modules/@smui/common/Label.svelte generated by Svelte v3.18.1 */

  function create_fragment$s(ctx) {
  	let span;
  	let useActions_action;
  	let forwardEvents_action;
  	let current;
  	let dispose;
  	const default_slot_template = /*$$slots*/ ctx[6].default;
  	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[5], null);

  	let span_levels = [
  		{
  			class: "\n    " + /*className*/ ctx[1] + "\n    " + (/*context*/ ctx[3] === "button"
  			? "mdc-button__label"
  			: "") + "\n    " + (/*context*/ ctx[3] === "fab" ? "mdc-fab__label" : "") + "\n    " + (/*context*/ ctx[3] === "chip" ? "mdc-chip__text" : "") + "\n    " + (/*context*/ ctx[3] === "tab"
  			? "mdc-tab__text-label"
  			: "") + "\n    " + (/*context*/ ctx[3] === "image-list"
  			? "mdc-image-list__label"
  			: "") + "\n    " + (/*context*/ ctx[3] === "snackbar"
  			? "mdc-snackbar__label"
  			: "") + "\n  "
  		},
  		/*context*/ ctx[3] === "snackbar"
  		? { role: "status", "aria-live": "polite" }
  		: {},
  		exclude(/*$$props*/ ctx[4], ["use", "class"])
  	];

  	let span_data = {};

  	for (let i = 0; i < span_levels.length; i += 1) {
  		span_data = assign(span_data, span_levels[i]);
  	}

  	return {
  		c() {
  			span = element("span");
  			if (default_slot) default_slot.c();
  			set_attributes(span, span_data);
  		},
  		m(target, anchor) {
  			insert(target, span, anchor);

  			if (default_slot) {
  				default_slot.m(span, null);
  			}

  			current = true;

  			dispose = [
  				action_destroyer(useActions_action = useActions.call(null, span, /*use*/ ctx[0])),
  				action_destroyer(forwardEvents_action = /*forwardEvents*/ ctx[2].call(null, span))
  			];
  		},
  		p(ctx, [dirty]) {
  			if (default_slot && default_slot.p && dirty & /*$$scope*/ 32) {
  				default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[5], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[5], dirty, null));
  			}

  			set_attributes(span, get_spread_update(span_levels, [
  				dirty & /*className, context*/ 10 && {
  					class: "\n    " + /*className*/ ctx[1] + "\n    " + (/*context*/ ctx[3] === "button"
  					? "mdc-button__label"
  					: "") + "\n    " + (/*context*/ ctx[3] === "fab" ? "mdc-fab__label" : "") + "\n    " + (/*context*/ ctx[3] === "chip" ? "mdc-chip__text" : "") + "\n    " + (/*context*/ ctx[3] === "tab"
  					? "mdc-tab__text-label"
  					: "") + "\n    " + (/*context*/ ctx[3] === "image-list"
  					? "mdc-image-list__label"
  					: "") + "\n    " + (/*context*/ ctx[3] === "snackbar"
  					? "mdc-snackbar__label"
  					: "") + "\n  "
  				},
  				dirty & /*context*/ 8 && (/*context*/ ctx[3] === "snackbar"
  				? { role: "status", "aria-live": "polite" }
  				: {}),
  				dirty & /*exclude, $$props*/ 16 && exclude(/*$$props*/ ctx[4], ["use", "class"])
  			]));

  			if (useActions_action && is_function(useActions_action.update) && dirty & /*use*/ 1) useActions_action.update.call(null, /*use*/ ctx[0]);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(default_slot, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(default_slot, local);
  			current = false;
  		},
  		d(detaching) {
  			if (detaching) detach(span);
  			if (default_slot) default_slot.d(detaching);
  			run_all(dispose);
  		}
  	};
  }

  function instance$o($$self, $$props, $$invalidate) {
  	const forwardEvents = forwardEventsBuilder(current_component);
  	let { use = [] } = $$props;
  	let { class: className = "" } = $$props;
  	const context = getContext("SMUI:label:context");
  	let { $$slots = {}, $$scope } = $$props;

  	$$self.$set = $$new_props => {
  		$$invalidate(4, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
  		if ("use" in $$new_props) $$invalidate(0, use = $$new_props.use);
  		if ("class" in $$new_props) $$invalidate(1, className = $$new_props.class);
  		if ("$$scope" in $$new_props) $$invalidate(5, $$scope = $$new_props.$$scope);
  	};

  	$$props = exclude_internal_props($$props);
  	return [use, className, forwardEvents, context, $$props, $$scope, $$slots];
  }

  class Label extends SvelteComponent {
  	constructor(options) {
  		super();
  		init(this, options, instance$o, create_fragment$s, safe_not_equal, { use: 0, class: 1 });
  	}
  }

  /**
   * @license
   * Copyright 2018 Google Inc.
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in
   * all copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
   * THE SOFTWARE.
   */
  var cssClasses$6 = {
      ACTIVE: 'mdc-tab-indicator--active',
      FADE: 'mdc-tab-indicator--fade',
      NO_TRANSITION: 'mdc-tab-indicator--no-transition',
  };
  var strings$7 = {
      CONTENT_SELECTOR: '.mdc-tab-indicator__content',
  };
  //# sourceMappingURL=constants.js.map

  /**
   * @license
   * Copyright 2018 Google Inc.
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in
   * all copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
   * THE SOFTWARE.
   */
  var MDCTabIndicatorFoundation = /** @class */ (function (_super) {
      __extends(MDCTabIndicatorFoundation, _super);
      function MDCTabIndicatorFoundation(adapter) {
          return _super.call(this, __assign({}, MDCTabIndicatorFoundation.defaultAdapter, adapter)) || this;
      }
      Object.defineProperty(MDCTabIndicatorFoundation, "cssClasses", {
          get: function () {
              return cssClasses$6;
          },
          enumerable: true,
          configurable: true
      });
      Object.defineProperty(MDCTabIndicatorFoundation, "strings", {
          get: function () {
              return strings$7;
          },
          enumerable: true,
          configurable: true
      });
      Object.defineProperty(MDCTabIndicatorFoundation, "defaultAdapter", {
          get: function () {
              // tslint:disable:object-literal-sort-keys Methods should be in the same order as the adapter interface.
              return {
                  addClass: function () { return undefined; },
                  removeClass: function () { return undefined; },
                  computeContentClientRect: function () { return ({ top: 0, right: 0, bottom: 0, left: 0, width: 0, height: 0 }); },
                  setContentStyleProperty: function () { return undefined; },
              };
              // tslint:enable:object-literal-sort-keys
          },
          enumerable: true,
          configurable: true
      });
      MDCTabIndicatorFoundation.prototype.computeContentClientRect = function () {
          return this.adapter_.computeContentClientRect();
      };
      return MDCTabIndicatorFoundation;
  }(MDCFoundation));
  //# sourceMappingURL=foundation.js.map

  /**
   * @license
   * Copyright 2018 Google Inc.
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in
   * all copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
   * THE SOFTWARE.
   */
  /* istanbul ignore next: subclass is not a branch statement */
  var MDCFadingTabIndicatorFoundation = /** @class */ (function (_super) {
      __extends(MDCFadingTabIndicatorFoundation, _super);
      function MDCFadingTabIndicatorFoundation() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      MDCFadingTabIndicatorFoundation.prototype.activate = function () {
          this.adapter_.addClass(MDCTabIndicatorFoundation.cssClasses.ACTIVE);
      };
      MDCFadingTabIndicatorFoundation.prototype.deactivate = function () {
          this.adapter_.removeClass(MDCTabIndicatorFoundation.cssClasses.ACTIVE);
      };
      return MDCFadingTabIndicatorFoundation;
  }(MDCTabIndicatorFoundation));
  //# sourceMappingURL=fading-foundation.js.map

  /**
   * @license
   * Copyright 2018 Google Inc.
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in
   * all copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
   * THE SOFTWARE.
   */
  /* istanbul ignore next: subclass is not a branch statement */
  var MDCSlidingTabIndicatorFoundation = /** @class */ (function (_super) {
      __extends(MDCSlidingTabIndicatorFoundation, _super);
      function MDCSlidingTabIndicatorFoundation() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      MDCSlidingTabIndicatorFoundation.prototype.activate = function (previousIndicatorClientRect) {
          // Early exit if no indicator is present to handle cases where an indicator
          // may be activated without a prior indicator state
          if (!previousIndicatorClientRect) {
              this.adapter_.addClass(MDCTabIndicatorFoundation.cssClasses.ACTIVE);
              return;
          }
          // This animation uses the FLIP approach. You can read more about it at the link below:
          // https://aerotwist.com/blog/flip-your-animations/
          // Calculate the dimensions based on the dimensions of the previous indicator
          var currentClientRect = this.computeContentClientRect();
          var widthDelta = previousIndicatorClientRect.width / currentClientRect.width;
          var xPosition = previousIndicatorClientRect.left - currentClientRect.left;
          this.adapter_.addClass(MDCTabIndicatorFoundation.cssClasses.NO_TRANSITION);
          this.adapter_.setContentStyleProperty('transform', "translateX(" + xPosition + "px) scaleX(" + widthDelta + ")");
          // Force repaint before updating classes and transform to ensure the transform properly takes effect
          this.computeContentClientRect();
          this.adapter_.removeClass(MDCTabIndicatorFoundation.cssClasses.NO_TRANSITION);
          this.adapter_.addClass(MDCTabIndicatorFoundation.cssClasses.ACTIVE);
          this.adapter_.setContentStyleProperty('transform', '');
      };
      MDCSlidingTabIndicatorFoundation.prototype.deactivate = function () {
          this.adapter_.removeClass(MDCTabIndicatorFoundation.cssClasses.ACTIVE);
      };
      return MDCSlidingTabIndicatorFoundation;
  }(MDCTabIndicatorFoundation));
  //# sourceMappingURL=sliding-foundation.js.map

  /**
   * @license
   * Copyright 2018 Google Inc.
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in
   * all copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
   * THE SOFTWARE.
   */
  var MDCTabIndicator = /** @class */ (function (_super) {
      __extends(MDCTabIndicator, _super);
      function MDCTabIndicator() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      MDCTabIndicator.attachTo = function (root) {
          return new MDCTabIndicator(root);
      };
      MDCTabIndicator.prototype.initialize = function () {
          this.content_ = this.root_.querySelector(MDCTabIndicatorFoundation.strings.CONTENT_SELECTOR);
      };
      MDCTabIndicator.prototype.computeContentClientRect = function () {
          return this.foundation_.computeContentClientRect();
      };
      MDCTabIndicator.prototype.getDefaultFoundation = function () {
          var _this = this;
          // DO NOT INLINE this variable. For backward compatibility, foundations take a Partial<MDCFooAdapter>.
          // To ensure we don't accidentally omit any methods, we need a separate, strongly typed adapter variable.
          // tslint:disable:object-literal-sort-keys Methods should be in the same order as the adapter interface.
          var adapter = {
              addClass: function (className) { return _this.root_.classList.add(className); },
              removeClass: function (className) { return _this.root_.classList.remove(className); },
              computeContentClientRect: function () { return _this.content_.getBoundingClientRect(); },
              setContentStyleProperty: function (prop, value) { return _this.content_.style.setProperty(prop, value); },
          };
          // tslint:enable:object-literal-sort-keys
          if (this.root_.classList.contains(MDCTabIndicatorFoundation.cssClasses.FADE)) {
              return new MDCFadingTabIndicatorFoundation(adapter);
          }
          // Default to the sliding indicator
          return new MDCSlidingTabIndicatorFoundation(adapter);
      };
      MDCTabIndicator.prototype.activate = function (previousIndicatorClientRect) {
          this.foundation_.activate(previousIndicatorClientRect);
      };
      MDCTabIndicator.prototype.deactivate = function () {
          this.foundation_.deactivate();
      };
      return MDCTabIndicator;
  }(MDCComponent));
  //# sourceMappingURL=component.js.map

  /**
   * @license
   * Copyright 2018 Google Inc.
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in
   * all copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
   * THE SOFTWARE.
   */
  var cssClasses$7 = {
      ACTIVE: 'mdc-tab--active',
  };
  var strings$8 = {
      ARIA_SELECTED: 'aria-selected',
      CONTENT_SELECTOR: '.mdc-tab__content',
      INTERACTED_EVENT: 'MDCTab:interacted',
      RIPPLE_SELECTOR: '.mdc-tab__ripple',
      TABINDEX: 'tabIndex',
      TAB_INDICATOR_SELECTOR: '.mdc-tab-indicator',
  };
  //# sourceMappingURL=constants.js.map

  /**
   * @license
   * Copyright 2018 Google Inc.
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in
   * all copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
   * THE SOFTWARE.
   */
  var MDCTabFoundation = /** @class */ (function (_super) {
      __extends(MDCTabFoundation, _super);
      function MDCTabFoundation(adapter) {
          var _this = _super.call(this, __assign({}, MDCTabFoundation.defaultAdapter, adapter)) || this;
          _this.focusOnActivate_ = true;
          return _this;
      }
      Object.defineProperty(MDCTabFoundation, "cssClasses", {
          get: function () {
              return cssClasses$7;
          },
          enumerable: true,
          configurable: true
      });
      Object.defineProperty(MDCTabFoundation, "strings", {
          get: function () {
              return strings$8;
          },
          enumerable: true,
          configurable: true
      });
      Object.defineProperty(MDCTabFoundation, "defaultAdapter", {
          get: function () {
              // tslint:disable:object-literal-sort-keys Methods should be in the same order as the adapter interface.
              return {
                  addClass: function () { return undefined; },
                  removeClass: function () { return undefined; },
                  hasClass: function () { return false; },
                  setAttr: function () { return undefined; },
                  activateIndicator: function () { return undefined; },
                  deactivateIndicator: function () { return undefined; },
                  notifyInteracted: function () { return undefined; },
                  getOffsetLeft: function () { return 0; },
                  getOffsetWidth: function () { return 0; },
                  getContentOffsetLeft: function () { return 0; },
                  getContentOffsetWidth: function () { return 0; },
                  focus: function () { return undefined; },
              };
              // tslint:enable:object-literal-sort-keys
          },
          enumerable: true,
          configurable: true
      });
      MDCTabFoundation.prototype.handleClick = function () {
          // It's up to the parent component to keep track of the active Tab and
          // ensure we don't activate a Tab that's already active.
          this.adapter_.notifyInteracted();
      };
      MDCTabFoundation.prototype.isActive = function () {
          return this.adapter_.hasClass(cssClasses$7.ACTIVE);
      };
      /**
       * Sets whether the tab should focus itself when activated
       */
      MDCTabFoundation.prototype.setFocusOnActivate = function (focusOnActivate) {
          this.focusOnActivate_ = focusOnActivate;
      };
      /**
       * Activates the Tab
       */
      MDCTabFoundation.prototype.activate = function (previousIndicatorClientRect) {
          this.adapter_.addClass(cssClasses$7.ACTIVE);
          this.adapter_.setAttr(strings$8.ARIA_SELECTED, 'true');
          this.adapter_.setAttr(strings$8.TABINDEX, '0');
          this.adapter_.activateIndicator(previousIndicatorClientRect);
          if (this.focusOnActivate_) {
              this.adapter_.focus();
          }
      };
      /**
       * Deactivates the Tab
       */
      MDCTabFoundation.prototype.deactivate = function () {
          // Early exit
          if (!this.isActive()) {
              return;
          }
          this.adapter_.removeClass(cssClasses$7.ACTIVE);
          this.adapter_.setAttr(strings$8.ARIA_SELECTED, 'false');
          this.adapter_.setAttr(strings$8.TABINDEX, '-1');
          this.adapter_.deactivateIndicator();
      };
      /**
       * Returns the dimensions of the Tab
       */
      MDCTabFoundation.prototype.computeDimensions = function () {
          var rootWidth = this.adapter_.getOffsetWidth();
          var rootLeft = this.adapter_.getOffsetLeft();
          var contentWidth = this.adapter_.getContentOffsetWidth();
          var contentLeft = this.adapter_.getContentOffsetLeft();
          return {
              contentLeft: rootLeft + contentLeft,
              contentRight: rootLeft + contentLeft + contentWidth,
              rootLeft: rootLeft,
              rootRight: rootLeft + rootWidth,
          };
      };
      return MDCTabFoundation;
  }(MDCFoundation));
  //# sourceMappingURL=foundation.js.map

  /**
   * @license
   * Copyright 2018 Google Inc.
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in
   * all copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
   * THE SOFTWARE.
   */
  var MDCTab = /** @class */ (function (_super) {
      __extends(MDCTab, _super);
      function MDCTab() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      MDCTab.attachTo = function (root) {
          return new MDCTab(root);
      };
      MDCTab.prototype.initialize = function (rippleFactory, tabIndicatorFactory) {
          if (rippleFactory === void 0) { rippleFactory = function (el, foundation) { return new MDCRipple(el, foundation); }; }
          if (tabIndicatorFactory === void 0) { tabIndicatorFactory = function (el) { return new MDCTabIndicator(el); }; }
          this.id = this.root_.id;
          var rippleSurface = this.root_.querySelector(MDCTabFoundation.strings.RIPPLE_SELECTOR);
          var rippleAdapter = __assign({}, MDCRipple.createAdapter(this), { addClass: function (className) { return rippleSurface.classList.add(className); }, removeClass: function (className) { return rippleSurface.classList.remove(className); }, updateCssVariable: function (varName, value) { return rippleSurface.style.setProperty(varName, value); } });
          var rippleFoundation = new MDCRippleFoundation(rippleAdapter);
          this.ripple_ = rippleFactory(this.root_, rippleFoundation);
          var tabIndicatorElement = this.root_.querySelector(MDCTabFoundation.strings.TAB_INDICATOR_SELECTOR);
          this.tabIndicator_ = tabIndicatorFactory(tabIndicatorElement);
          this.content_ = this.root_.querySelector(MDCTabFoundation.strings.CONTENT_SELECTOR);
      };
      MDCTab.prototype.initialSyncWithDOM = function () {
          var _this = this;
          this.handleClick_ = function () { return _this.foundation_.handleClick(); };
          this.listen('click', this.handleClick_);
      };
      MDCTab.prototype.destroy = function () {
          this.unlisten('click', this.handleClick_);
          this.ripple_.destroy();
          _super.prototype.destroy.call(this);
      };
      MDCTab.prototype.getDefaultFoundation = function () {
          var _this = this;
          // DO NOT INLINE this variable. For backward compatibility, foundations take a Partial<MDCFooAdapter>.
          // To ensure we don't accidentally omit any methods, we need a separate, strongly typed adapter variable.
          // tslint:disable:object-literal-sort-keys Methods should be in the same order as the adapter interface.
          var adapter = {
              setAttr: function (attr, value) { return _this.root_.setAttribute(attr, value); },
              addClass: function (className) { return _this.root_.classList.add(className); },
              removeClass: function (className) { return _this.root_.classList.remove(className); },
              hasClass: function (className) { return _this.root_.classList.contains(className); },
              activateIndicator: function (previousIndicatorClientRect) { return _this.tabIndicator_.activate(previousIndicatorClientRect); },
              deactivateIndicator: function () { return _this.tabIndicator_.deactivate(); },
              notifyInteracted: function () { return _this.emit(MDCTabFoundation.strings.INTERACTED_EVENT, { tabId: _this.id }, true /* bubble */); },
              getOffsetLeft: function () { return _this.root_.offsetLeft; },
              getOffsetWidth: function () { return _this.root_.offsetWidth; },
              getContentOffsetLeft: function () { return _this.content_.offsetLeft; },
              getContentOffsetWidth: function () { return _this.content_.offsetWidth; },
              focus: function () { return _this.root_.focus(); },
          };
          // tslint:enable:object-literal-sort-keys
          return new MDCTabFoundation(adapter);
      };
      Object.defineProperty(MDCTab.prototype, "active", {
          /**
           * Getter for the active state of the tab
           */
          get: function () {
              return this.foundation_.isActive();
          },
          enumerable: true,
          configurable: true
      });
      Object.defineProperty(MDCTab.prototype, "focusOnActivate", {
          set: function (focusOnActivate) {
              this.foundation_.setFocusOnActivate(focusOnActivate);
          },
          enumerable: true,
          configurable: true
      });
      /**
       * Activates the tab
       */
      MDCTab.prototype.activate = function (computeIndicatorClientRect) {
          this.foundation_.activate(computeIndicatorClientRect);
      };
      /**
       * Deactivates the tab
       */
      MDCTab.prototype.deactivate = function () {
          this.foundation_.deactivate();
      };
      /**
       * Returns the indicator's client rect
       */
      MDCTab.prototype.computeIndicatorClientRect = function () {
          return this.tabIndicator_.computeContentClientRect();
      };
      MDCTab.prototype.computeDimensions = function () {
          return this.foundation_.computeDimensions();
      };
      /**
       * Focuses the tab
       */
      MDCTab.prototype.focus = function () {
          this.root_.focus();
      };
      return MDCTab;
  }(MDCComponent));
  //# sourceMappingURL=component.js.map

  function prefixFilter(obj, prefix) {
    let names = Object.getOwnPropertyNames(obj);
    const newObj = {};

    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      if (name.substring(0, prefix.length) === prefix) {
        newObj[name.substring(prefix.length)] = obj[name];
      }
    }

    return newObj;
  }

  /* node_modules/@smui/tab-indicator/TabIndicator.svelte generated by Svelte v3.18.1 */

  function create_fragment$t(ctx) {
  	let span1;
  	let span0;
  	let useActions_action;
  	let useActions_action_1;
  	let forwardEvents_action;
  	let current;
  	let dispose;
  	const default_slot_template = /*$$slots*/ ctx[17].default;
  	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[16], null);

  	let span0_levels = [
  		{
  			class: "\n      mdc-tab-indicator__content\n      " + /*content$class*/ ctx[6] + "\n      " + (/*type*/ ctx[3] === "underline"
  			? "mdc-tab-indicator__content--underline"
  			: "") + "\n      " + (/*type*/ ctx[3] === "icon"
  			? "mdc-tab-indicator__content--icon"
  			: "") + "\n    "
  		},
  		{
  			"aria-hidden": /*type*/ ctx[3] === "icon" ? "true" : "false"
  		},
  		exclude(prefixFilter(/*$$props*/ ctx[9], "content$"), ["use", "class"])
  	];

  	let span0_data = {};

  	for (let i = 0; i < span0_levels.length; i += 1) {
  		span0_data = assign(span0_data, span0_levels[i]);
  	}

  	let span1_levels = [
  		{
  			class: "\n    mdc-tab-indicator\n    " + /*className*/ ctx[1] + "\n    " + (/*active*/ ctx[2] ? "mdc-tab-indicator--active" : "") + "\n    " + (/*transition*/ ctx[4] === "fade"
  			? "mdc-tab-indicator--fade"
  			: "") + "\n  "
  		},
  		exclude(/*$$props*/ ctx[9], ["use", "class", "active", "type", "transition", "content$"])
  	];

  	let span1_data = {};

  	for (let i = 0; i < span1_levels.length; i += 1) {
  		span1_data = assign(span1_data, span1_levels[i]);
  	}

  	return {
  		c() {
  			span1 = element("span");
  			span0 = element("span");
  			if (default_slot) default_slot.c();
  			set_attributes(span0, span0_data);
  			set_attributes(span1, span1_data);
  		},
  		m(target, anchor) {
  			insert(target, span1, anchor);
  			append(span1, span0);

  			if (default_slot) {
  				default_slot.m(span0, null);
  			}

  			/*span1_binding*/ ctx[18](span1);
  			current = true;

  			dispose = [
  				action_destroyer(useActions_action = useActions.call(null, span0, /*content$use*/ ctx[5])),
  				action_destroyer(useActions_action_1 = useActions.call(null, span1, /*use*/ ctx[0])),
  				action_destroyer(forwardEvents_action = /*forwardEvents*/ ctx[8].call(null, span1))
  			];
  		},
  		p(ctx, [dirty]) {
  			if (default_slot && default_slot.p && dirty & /*$$scope*/ 65536) {
  				default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[16], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[16], dirty, null));
  			}

  			set_attributes(span0, get_spread_update(span0_levels, [
  				dirty & /*content$class, type*/ 72 && {
  					class: "\n      mdc-tab-indicator__content\n      " + /*content$class*/ ctx[6] + "\n      " + (/*type*/ ctx[3] === "underline"
  					? "mdc-tab-indicator__content--underline"
  					: "") + "\n      " + (/*type*/ ctx[3] === "icon"
  					? "mdc-tab-indicator__content--icon"
  					: "") + "\n    "
  				},
  				dirty & /*type*/ 8 && {
  					"aria-hidden": /*type*/ ctx[3] === "icon" ? "true" : "false"
  				},
  				dirty & /*exclude, prefixFilter, $$props*/ 512 && exclude(prefixFilter(/*$$props*/ ctx[9], "content$"), ["use", "class"])
  			]));

  			if (useActions_action && is_function(useActions_action.update) && dirty & /*content$use*/ 32) useActions_action.update.call(null, /*content$use*/ ctx[5]);

  			set_attributes(span1, get_spread_update(span1_levels, [
  				dirty & /*className, active, transition*/ 22 && {
  					class: "\n    mdc-tab-indicator\n    " + /*className*/ ctx[1] + "\n    " + (/*active*/ ctx[2] ? "mdc-tab-indicator--active" : "") + "\n    " + (/*transition*/ ctx[4] === "fade"
  					? "mdc-tab-indicator--fade"
  					: "") + "\n  "
  				},
  				dirty & /*exclude, $$props*/ 512 && exclude(/*$$props*/ ctx[9], ["use", "class", "active", "type", "transition", "content$"])
  			]));

  			if (useActions_action_1 && is_function(useActions_action_1.update) && dirty & /*use*/ 1) useActions_action_1.update.call(null, /*use*/ ctx[0]);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(default_slot, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(default_slot, local);
  			current = false;
  		},
  		d(detaching) {
  			if (detaching) detach(span1);
  			if (default_slot) default_slot.d(detaching);
  			/*span1_binding*/ ctx[18](null);
  			run_all(dispose);
  		}
  	};
  }

  function instance$p($$self, $$props, $$invalidate) {
  	const forwardEvents = forwardEventsBuilder(current_component);
  	let { use = [] } = $$props;
  	let { class: className = "" } = $$props;
  	let { active = false } = $$props;
  	let { type = "underline" } = $$props;
  	let { transition = "slide" } = $$props;
  	let { content$use = [] } = $$props;
  	let { content$class = "" } = $$props;
  	let element;
  	let tabIndicator;
  	let instantiate = getContext("SMUI:tab-indicator:instantiate");
  	let getInstance = getContext("SMUI:tab-indicator:getInstance");

  	onMount(async () => {
  		if (instantiate !== false) {
  			tabIndicator = new MDCTabIndicator(element);
  		} else {
  			tabIndicator = await getInstance();
  		}
  	});

  	onDestroy(() => {
  		tabIndicator && tabIndicator.destroy();
  	});

  	function activate(...args) {
  		return tabIndicator.activate(...args);
  	}

  	function deactivate(...args) {
  		return tabIndicator.deactivate(...args);
  	}

  	function computeContentClientRect(...args) {
  		return tabIndicator.computeContentClientRect(...args);
  	}

  	let { $$slots = {}, $$scope } = $$props;

  	function span1_binding($$value) {
  		binding_callbacks[$$value ? "unshift" : "push"](() => {
  			$$invalidate(7, element = $$value);
  		});
  	}

  	$$self.$set = $$new_props => {
  		$$invalidate(9, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
  		if ("use" in $$new_props) $$invalidate(0, use = $$new_props.use);
  		if ("class" in $$new_props) $$invalidate(1, className = $$new_props.class);
  		if ("active" in $$new_props) $$invalidate(2, active = $$new_props.active);
  		if ("type" in $$new_props) $$invalidate(3, type = $$new_props.type);
  		if ("transition" in $$new_props) $$invalidate(4, transition = $$new_props.transition);
  		if ("content$use" in $$new_props) $$invalidate(5, content$use = $$new_props.content$use);
  		if ("content$class" in $$new_props) $$invalidate(6, content$class = $$new_props.content$class);
  		if ("$$scope" in $$new_props) $$invalidate(16, $$scope = $$new_props.$$scope);
  	};

  	$$props = exclude_internal_props($$props);

  	return [
  		use,
  		className,
  		active,
  		type,
  		transition,
  		content$use,
  		content$class,
  		element,
  		forwardEvents,
  		$$props,
  		activate,
  		deactivate,
  		computeContentClientRect,
  		tabIndicator,
  		instantiate,
  		getInstance,
  		$$scope,
  		$$slots,
  		span1_binding
  	];
  }

  class TabIndicator extends SvelteComponent {
  	constructor(options) {
  		super();

  		init(this, options, instance$p, create_fragment$t, safe_not_equal, {
  			use: 0,
  			class: 1,
  			active: 2,
  			type: 3,
  			transition: 4,
  			content$use: 5,
  			content$class: 6,
  			activate: 10,
  			deactivate: 11,
  			computeContentClientRect: 12
  		});
  	}

  	get activate() {
  		return this.$$.ctx[10];
  	}

  	get deactivate() {
  		return this.$$.ctx[11];
  	}

  	get computeContentClientRect() {
  		return this.$$.ctx[12];
  	}
  }

  /* node_modules/@smui/tab/Tab.svelte generated by Svelte v3.18.1 */
  const get_tab_indicator_slot_changes_1 = dirty => ({});
  const get_tab_indicator_slot_context_1 = ctx => ({});
  const get_tab_indicator_slot_changes = dirty => ({});
  const get_tab_indicator_slot_context = ctx => ({});

  // (24:4) {#if indicatorSpanOnlyContent}
  function create_if_block_2(ctx) {
  	let current;

  	const tabindicator_spread_levels = [
  		{ active: /*active*/ ctx[0] },
  		prefixFilter(/*$$props*/ ctx[12], "tabIndicator$")
  	];

  	let tabindicator_props = {
  		$$slots: { default: [create_default_slot_1$5] },
  		$$scope: { ctx }
  	};

  	for (let i = 0; i < tabindicator_spread_levels.length; i += 1) {
  		tabindicator_props = assign(tabindicator_props, tabindicator_spread_levels[i]);
  	}

  	const tabindicator = new TabIndicator({ props: tabindicator_props });

  	return {
  		c() {
  			create_component(tabindicator.$$.fragment);
  		},
  		m(target, anchor) {
  			mount_component(tabindicator, target, anchor);
  			current = true;
  		},
  		p(ctx, dirty) {
  			const tabindicator_changes = (dirty & /*active, prefixFilter, $$props*/ 4097)
  			? get_spread_update(tabindicator_spread_levels, [
  					dirty & /*active*/ 1 && { active: /*active*/ ctx[0] },
  					dirty & /*prefixFilter, $$props*/ 4096 && get_spread_object(prefixFilter(/*$$props*/ ctx[12], "tabIndicator$"))
  				])
  			: {};

  			if (dirty & /*$$scope*/ 536870912) {
  				tabindicator_changes.$$scope = { dirty, ctx };
  			}

  			tabindicator.$set(tabindicator_changes);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(tabindicator.$$.fragment, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(tabindicator.$$.fragment, local);
  			current = false;
  		},
  		d(detaching) {
  			destroy_component(tabindicator, detaching);
  		}
  	};
  }

  // (25:6) <TabIndicator         {active}         {...prefixFilter($$props, 'tabIndicator$')}       >
  function create_default_slot_1$5(ctx) {
  	let current;
  	const tab_indicator_slot_template = /*$$slots*/ ctx[27]["tab-indicator"];
  	const tab_indicator_slot = create_slot(tab_indicator_slot_template, ctx, /*$$scope*/ ctx[29], get_tab_indicator_slot_context);

  	return {
  		c() {
  			if (tab_indicator_slot) tab_indicator_slot.c();
  		},
  		m(target, anchor) {
  			if (tab_indicator_slot) {
  				tab_indicator_slot.m(target, anchor);
  			}

  			current = true;
  		},
  		p(ctx, dirty) {
  			if (tab_indicator_slot && tab_indicator_slot.p && dirty & /*$$scope*/ 536870912) {
  				tab_indicator_slot.p(get_slot_context(tab_indicator_slot_template, ctx, /*$$scope*/ ctx[29], get_tab_indicator_slot_context), get_slot_changes(tab_indicator_slot_template, /*$$scope*/ ctx[29], dirty, get_tab_indicator_slot_changes));
  			}
  		},
  		i(local) {
  			if (current) return;
  			transition_in(tab_indicator_slot, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(tab_indicator_slot, local);
  			current = false;
  		},
  		d(detaching) {
  			if (tab_indicator_slot) tab_indicator_slot.d(detaching);
  		}
  	};
  }

  // (31:2) {#if !indicatorSpanOnlyContent}
  function create_if_block_1$1(ctx) {
  	let current;

  	const tabindicator_spread_levels = [
  		{ active: /*active*/ ctx[0] },
  		prefixFilter(/*$$props*/ ctx[12], "tabIndicator$")
  	];

  	let tabindicator_props = {
  		$$slots: { default: [create_default_slot$7] },
  		$$scope: { ctx }
  	};

  	for (let i = 0; i < tabindicator_spread_levels.length; i += 1) {
  		tabindicator_props = assign(tabindicator_props, tabindicator_spread_levels[i]);
  	}

  	const tabindicator = new TabIndicator({ props: tabindicator_props });

  	return {
  		c() {
  			create_component(tabindicator.$$.fragment);
  		},
  		m(target, anchor) {
  			mount_component(tabindicator, target, anchor);
  			current = true;
  		},
  		p(ctx, dirty) {
  			const tabindicator_changes = (dirty & /*active, prefixFilter, $$props*/ 4097)
  			? get_spread_update(tabindicator_spread_levels, [
  					dirty & /*active*/ 1 && { active: /*active*/ ctx[0] },
  					dirty & /*prefixFilter, $$props*/ 4096 && get_spread_object(prefixFilter(/*$$props*/ ctx[12], "tabIndicator$"))
  				])
  			: {};

  			if (dirty & /*$$scope*/ 536870912) {
  				tabindicator_changes.$$scope = { dirty, ctx };
  			}

  			tabindicator.$set(tabindicator_changes);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(tabindicator.$$.fragment, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(tabindicator.$$.fragment, local);
  			current = false;
  		},
  		d(detaching) {
  			destroy_component(tabindicator, detaching);
  		}
  	};
  }

  // (32:4) <TabIndicator       {active}       {...prefixFilter($$props, 'tabIndicator$')}     >
  function create_default_slot$7(ctx) {
  	let current;
  	const tab_indicator_slot_template = /*$$slots*/ ctx[27]["tab-indicator"];
  	const tab_indicator_slot = create_slot(tab_indicator_slot_template, ctx, /*$$scope*/ ctx[29], get_tab_indicator_slot_context_1);

  	return {
  		c() {
  			if (tab_indicator_slot) tab_indicator_slot.c();
  		},
  		m(target, anchor) {
  			if (tab_indicator_slot) {
  				tab_indicator_slot.m(target, anchor);
  			}

  			current = true;
  		},
  		p(ctx, dirty) {
  			if (tab_indicator_slot && tab_indicator_slot.p && dirty & /*$$scope*/ 536870912) {
  				tab_indicator_slot.p(get_slot_context(tab_indicator_slot_template, ctx, /*$$scope*/ ctx[29], get_tab_indicator_slot_context_1), get_slot_changes(tab_indicator_slot_template, /*$$scope*/ ctx[29], dirty, get_tab_indicator_slot_changes_1));
  			}
  		},
  		i(local) {
  			if (current) return;
  			transition_in(tab_indicator_slot, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(tab_indicator_slot, local);
  			current = false;
  		},
  		d(detaching) {
  			if (tab_indicator_slot) tab_indicator_slot.d(detaching);
  		}
  	};
  }

  // (37:2) {#if ripple}
  function create_if_block$4(ctx) {
  	let span;

  	return {
  		c() {
  			span = element("span");
  			attr(span, "class", "mdc-tab__ripple");
  		},
  		m(target, anchor) {
  			insert(target, span, anchor);
  		},
  		d(detaching) {
  			if (detaching) detach(span);
  		}
  	};
  }

  function create_fragment$u(ctx) {
  	let button;
  	let span;
  	let t0;
  	let useActions_action;
  	let t1;
  	let t2;
  	let useActions_action_1;
  	let forwardEvents_action;
  	let current;
  	let dispose;
  	const default_slot_template = /*$$slots*/ ctx[27].default;
  	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[29], null);
  	let if_block0 = /*indicatorSpanOnlyContent*/ ctx[6] && create_if_block_2(ctx);

  	let span_levels = [
  		{
  			class: "mdc-tab__content " + /*content$class*/ ctx[8]
  		},
  		exclude(prefixFilter(/*$$props*/ ctx[12], "content$"), ["use", "class"])
  	];

  	let span_data = {};

  	for (let i = 0; i < span_levels.length; i += 1) {
  		span_data = assign(span_data, span_levels[i]);
  	}

  	let if_block1 = !/*indicatorSpanOnlyContent*/ ctx[6] && create_if_block_1$1(ctx);
  	let if_block2 = /*ripple*/ ctx[3] && create_if_block$4();

  	let button_levels = [
  		{
  			class: "\n    mdc-tab\n    " + /*className*/ ctx[2] + "\n    " + (/*active*/ ctx[0] ? "mdc-tab--active" : "") + "\n    " + (/*stacked*/ ctx[4] ? "mdc-tab--stacked" : "") + "\n    " + (/*minWidth*/ ctx[5] ? "mdc-tab--min-width" : "") + "\n  "
  		},
  		{ role: "tab" },
  		{ "aria-selected": /*active*/ ctx[0] },
  		{ tabindex: /*active*/ ctx[0] ? "0" : "-1" },
  		exclude(/*$$props*/ ctx[12], [
  			"use",
  			"class",
  			"ripple",
  			"active",
  			"stacked",
  			"minWidth",
  			"indicatorSpanOnlyContent",
  			"focusOnActivate",
  			"content$",
  			"tabIndicator$"
  		])
  	];

  	let button_data = {};

  	for (let i = 0; i < button_levels.length; i += 1) {
  		button_data = assign(button_data, button_levels[i]);
  	}

  	return {
  		c() {
  			button = element("button");
  			span = element("span");
  			if (default_slot) default_slot.c();
  			t0 = space();
  			if (if_block0) if_block0.c();
  			t1 = space();
  			if (if_block1) if_block1.c();
  			t2 = space();
  			if (if_block2) if_block2.c();
  			set_attributes(span, span_data);
  			set_attributes(button, button_data);
  		},
  		m(target, anchor) {
  			insert(target, button, anchor);
  			append(button, span);

  			if (default_slot) {
  				default_slot.m(span, null);
  			}

  			append(span, t0);
  			if (if_block0) if_block0.m(span, null);
  			append(button, t1);
  			if (if_block1) if_block1.m(button, null);
  			append(button, t2);
  			if (if_block2) if_block2.m(button, null);
  			/*button_binding*/ ctx[28](button);
  			current = true;

  			dispose = [
  				action_destroyer(useActions_action = useActions.call(null, span, /*content$use*/ ctx[7])),
  				action_destroyer(useActions_action_1 = useActions.call(null, button, /*use*/ ctx[1])),
  				action_destroyer(forwardEvents_action = /*forwardEvents*/ ctx[10].call(null, button)),
  				listen(button, "MDCTab:interacted", /*interactedHandler*/ ctx[11])
  			];
  		},
  		p(ctx, [dirty]) {
  			if (default_slot && default_slot.p && dirty & /*$$scope*/ 536870912) {
  				default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[29], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[29], dirty, null));
  			}

  			if (/*indicatorSpanOnlyContent*/ ctx[6]) {
  				if (if_block0) {
  					if_block0.p(ctx, dirty);
  					transition_in(if_block0, 1);
  				} else {
  					if_block0 = create_if_block_2(ctx);
  					if_block0.c();
  					transition_in(if_block0, 1);
  					if_block0.m(span, null);
  				}
  			} else if (if_block0) {
  				group_outros();

  				transition_out(if_block0, 1, 1, () => {
  					if_block0 = null;
  				});

  				check_outros();
  			}

  			set_attributes(span, get_spread_update(span_levels, [
  				dirty & /*content$class*/ 256 && {
  					class: "mdc-tab__content " + /*content$class*/ ctx[8]
  				},
  				dirty & /*exclude, prefixFilter, $$props*/ 4096 && exclude(prefixFilter(/*$$props*/ ctx[12], "content$"), ["use", "class"])
  			]));

  			if (useActions_action && is_function(useActions_action.update) && dirty & /*content$use*/ 128) useActions_action.update.call(null, /*content$use*/ ctx[7]);

  			if (!/*indicatorSpanOnlyContent*/ ctx[6]) {
  				if (if_block1) {
  					if_block1.p(ctx, dirty);
  					transition_in(if_block1, 1);
  				} else {
  					if_block1 = create_if_block_1$1(ctx);
  					if_block1.c();
  					transition_in(if_block1, 1);
  					if_block1.m(button, t2);
  				}
  			} else if (if_block1) {
  				group_outros();

  				transition_out(if_block1, 1, 1, () => {
  					if_block1 = null;
  				});

  				check_outros();
  			}

  			if (/*ripple*/ ctx[3]) {
  				if (!if_block2) {
  					if_block2 = create_if_block$4();
  					if_block2.c();
  					if_block2.m(button, null);
  				}
  			} else if (if_block2) {
  				if_block2.d(1);
  				if_block2 = null;
  			}

  			set_attributes(button, get_spread_update(button_levels, [
  				dirty & /*className, active, stacked, minWidth*/ 53 && {
  					class: "\n    mdc-tab\n    " + /*className*/ ctx[2] + "\n    " + (/*active*/ ctx[0] ? "mdc-tab--active" : "") + "\n    " + (/*stacked*/ ctx[4] ? "mdc-tab--stacked" : "") + "\n    " + (/*minWidth*/ ctx[5] ? "mdc-tab--min-width" : "") + "\n  "
  				},
  				{ role: "tab" },
  				dirty & /*active*/ 1 && { "aria-selected": /*active*/ ctx[0] },
  				dirty & /*active*/ 1 && { tabindex: /*active*/ ctx[0] ? "0" : "-1" },
  				dirty & /*exclude, $$props*/ 4096 && exclude(/*$$props*/ ctx[12], [
  					"use",
  					"class",
  					"ripple",
  					"active",
  					"stacked",
  					"minWidth",
  					"indicatorSpanOnlyContent",
  					"focusOnActivate",
  					"content$",
  					"tabIndicator$"
  				])
  			]));

  			if (useActions_action_1 && is_function(useActions_action_1.update) && dirty & /*use*/ 2) useActions_action_1.update.call(null, /*use*/ ctx[1]);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(default_slot, local);
  			transition_in(if_block0);
  			transition_in(if_block1);
  			current = true;
  		},
  		o(local) {
  			transition_out(default_slot, local);
  			transition_out(if_block0);
  			transition_out(if_block1);
  			current = false;
  		},
  		d(detaching) {
  			if (detaching) detach(button);
  			if (default_slot) default_slot.d(detaching);
  			if (if_block0) if_block0.d();
  			if (if_block1) if_block1.d();
  			if (if_block2) if_block2.d();
  			/*button_binding*/ ctx[28](null);
  			run_all(dispose);
  		}
  	};
  }

  function instance$q($$self, $$props, $$invalidate) {
  	const forwardEvents = forwardEventsBuilder(current_component, ["MDCTab:interacted"]);
  	let activeEntry = getContext("SMUI:tab:active");
  	let { use = [] } = $$props;
  	let { class: className = "" } = $$props;
  	let { tab: tabEntry } = $$props;
  	let { ripple = true } = $$props;
  	let { active = tabEntry === activeEntry } = $$props;
  	let { stacked = false } = $$props;
  	let { minWidth = false } = $$props;
  	let { indicatorSpanOnlyContent = false } = $$props;
  	let { focusOnActivate = true } = $$props;
  	let { content$use = [] } = $$props;
  	let { content$class = "" } = $$props;
  	let element;
  	let tab;
  	let instantiate = getContext("SMUI:tab:instantiate");
  	let getInstance = getContext("SMUI:tab:getInstance");
  	let tabIndicatorPromiseResolve;
  	let tabIndicatorPromise = new Promise(resolve => tabIndicatorPromiseResolve = resolve);
  	setContext("SMUI:tab-indicator:instantiate", false);
  	setContext("SMUI:tab-indicator:getInstance", getTabIndicatorInstancePromise);
  	setContext("SMUI:label:context", "tab");
  	setContext("SMUI:icon:context", "tab");

  	if (!tabEntry) {
  		throw new Error("The tab property is required! It should be passed down from the TabBar to the Tab.");
  	}

  	onMount(async () => {
  		if (instantiate !== false) {
  			$$invalidate(20, tab = new MDCTab(element));
  		} else {
  			$$invalidate(20, tab = await getInstance(tabEntry));
  		}

  		tabIndicatorPromiseResolve(tab.tabIndicator_);

  		if (!ripple) {
  			tab.ripple_ && tab.ripple_.destroy();
  		}
  	});

  	onDestroy(() => {
  		tab && tab.destroy();
  	});

  	function getTabIndicatorInstancePromise() {
  		return tabIndicatorPromise;
  	}

  	function interactedHandler() {
  		$$invalidate(0, active = tab.active);
  	}

  	function activate(...args) {
  		$$invalidate(0, active = true);
  		return tab.activate(...args);
  	}

  	function deactivate(...args) {
  		$$invalidate(0, active = false);
  		return tab.deactivate(...args);
  	}

  	function focus(...args) {
  		return tab.focus(...args);
  	}

  	function computeIndicatorClientRect(...args) {
  		return tab.computeIndicatorClientRect(...args);
  	}

  	function computeDimensions(...args) {
  		return tab.computeDimensions(...args);
  	}

  	let { $$slots = {}, $$scope } = $$props;

  	function button_binding($$value) {
  		binding_callbacks[$$value ? "unshift" : "push"](() => {
  			$$invalidate(9, element = $$value);
  		});
  	}

  	$$self.$set = $$new_props => {
  		$$invalidate(12, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
  		if ("use" in $$new_props) $$invalidate(1, use = $$new_props.use);
  		if ("class" in $$new_props) $$invalidate(2, className = $$new_props.class);
  		if ("tab" in $$new_props) $$invalidate(13, tabEntry = $$new_props.tab);
  		if ("ripple" in $$new_props) $$invalidate(3, ripple = $$new_props.ripple);
  		if ("active" in $$new_props) $$invalidate(0, active = $$new_props.active);
  		if ("stacked" in $$new_props) $$invalidate(4, stacked = $$new_props.stacked);
  		if ("minWidth" in $$new_props) $$invalidate(5, minWidth = $$new_props.minWidth);
  		if ("indicatorSpanOnlyContent" in $$new_props) $$invalidate(6, indicatorSpanOnlyContent = $$new_props.indicatorSpanOnlyContent);
  		if ("focusOnActivate" in $$new_props) $$invalidate(14, focusOnActivate = $$new_props.focusOnActivate);
  		if ("content$use" in $$new_props) $$invalidate(7, content$use = $$new_props.content$use);
  		if ("content$class" in $$new_props) $$invalidate(8, content$class = $$new_props.content$class);
  		if ("$$scope" in $$new_props) $$invalidate(29, $$scope = $$new_props.$$scope);
  	};

  	$$self.$$.update = () => {
  		if ($$self.$$.dirty & /*tab, focusOnActivate*/ 1064960) {
  			 if (tab) {
  				$$invalidate(20, tab.focusOnActivate = focusOnActivate, tab);
  			}
  		}

  		if ($$self.$$.dirty & /*tab, active*/ 1048577) {
  			 if (tab && tab.active !== active) {
  				$$invalidate(0, active = tab.active);
  			}
  		}
  	};

  	$$props = exclude_internal_props($$props);

  	return [
  		active,
  		use,
  		className,
  		ripple,
  		stacked,
  		minWidth,
  		indicatorSpanOnlyContent,
  		content$use,
  		content$class,
  		element,
  		forwardEvents,
  		interactedHandler,
  		$$props,
  		tabEntry,
  		focusOnActivate,
  		activate,
  		deactivate,
  		focus,
  		computeIndicatorClientRect,
  		computeDimensions,
  		tab,
  		tabIndicatorPromiseResolve,
  		activeEntry,
  		instantiate,
  		getInstance,
  		tabIndicatorPromise,
  		getTabIndicatorInstancePromise,
  		$$slots,
  		button_binding,
  		$$scope
  	];
  }

  class Tab extends SvelteComponent {
  	constructor(options) {
  		super();

  		init(this, options, instance$q, create_fragment$u, safe_not_equal, {
  			use: 1,
  			class: 2,
  			tab: 13,
  			ripple: 3,
  			active: 0,
  			stacked: 4,
  			minWidth: 5,
  			indicatorSpanOnlyContent: 6,
  			focusOnActivate: 14,
  			content$use: 7,
  			content$class: 8,
  			activate: 15,
  			deactivate: 16,
  			focus: 17,
  			computeIndicatorClientRect: 18,
  			computeDimensions: 19
  		});
  	}

  	get activate() {
  		return this.$$.ctx[15];
  	}

  	get deactivate() {
  		return this.$$.ctx[16];
  	}

  	get focus() {
  		return this.$$.ctx[17];
  	}

  	get computeIndicatorClientRect() {
  		return this.$$.ctx[18];
  	}

  	get computeDimensions() {
  		return this.$$.ctx[19];
  	}
  }

  /**
   * @license
   * Copyright 2018 Google Inc.
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in
   * all copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
   * THE SOFTWARE.
   */
  var cssClasses$8 = {
      ANIMATING: 'mdc-tab-scroller--animating',
      SCROLL_AREA_SCROLL: 'mdc-tab-scroller__scroll-area--scroll',
      SCROLL_TEST: 'mdc-tab-scroller__test',
  };
  var strings$9 = {
      AREA_SELECTOR: '.mdc-tab-scroller__scroll-area',
      CONTENT_SELECTOR: '.mdc-tab-scroller__scroll-content',
  };
  //# sourceMappingURL=constants.js.map

  /**
   * @license
   * Copyright 2018 Google Inc.
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in
   * all copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
   * THE SOFTWARE.
   */
  var MDCTabScrollerRTL = /** @class */ (function () {
      function MDCTabScrollerRTL(adapter) {
          this.adapter_ = adapter;
      }
      return MDCTabScrollerRTL;
  }());
  //# sourceMappingURL=rtl-scroller.js.map

  /**
   * @license
   * Copyright 2018 Google Inc.
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in
   * all copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
   * THE SOFTWARE.
   */
  var MDCTabScrollerRTLDefault = /** @class */ (function (_super) {
      __extends(MDCTabScrollerRTLDefault, _super);
      function MDCTabScrollerRTLDefault() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      MDCTabScrollerRTLDefault.prototype.getScrollPositionRTL = function () {
          var currentScrollLeft = this.adapter_.getScrollAreaScrollLeft();
          var right = this.calculateScrollEdges_().right;
          // Scroll values on most browsers are ints instead of floats so we round
          return Math.round(right - currentScrollLeft);
      };
      MDCTabScrollerRTLDefault.prototype.scrollToRTL = function (scrollX) {
          var edges = this.calculateScrollEdges_();
          var currentScrollLeft = this.adapter_.getScrollAreaScrollLeft();
          var clampedScrollLeft = this.clampScrollValue_(edges.right - scrollX);
          return {
              finalScrollPosition: clampedScrollLeft,
              scrollDelta: clampedScrollLeft - currentScrollLeft,
          };
      };
      MDCTabScrollerRTLDefault.prototype.incrementScrollRTL = function (scrollX) {
          var currentScrollLeft = this.adapter_.getScrollAreaScrollLeft();
          var clampedScrollLeft = this.clampScrollValue_(currentScrollLeft - scrollX);
          return {
              finalScrollPosition: clampedScrollLeft,
              scrollDelta: clampedScrollLeft - currentScrollLeft,
          };
      };
      MDCTabScrollerRTLDefault.prototype.getAnimatingScrollPosition = function (scrollX) {
          return scrollX;
      };
      MDCTabScrollerRTLDefault.prototype.calculateScrollEdges_ = function () {
          var contentWidth = this.adapter_.getScrollContentOffsetWidth();
          var rootWidth = this.adapter_.getScrollAreaOffsetWidth();
          return {
              left: 0,
              right: contentWidth - rootWidth,
          };
      };
      MDCTabScrollerRTLDefault.prototype.clampScrollValue_ = function (scrollX) {
          var edges = this.calculateScrollEdges_();
          return Math.min(Math.max(edges.left, scrollX), edges.right);
      };
      return MDCTabScrollerRTLDefault;
  }(MDCTabScrollerRTL));
  //# sourceMappingURL=rtl-default-scroller.js.map

  /**
   * @license
   * Copyright 2018 Google Inc.
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in
   * all copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
   * THE SOFTWARE.
   */
  var MDCTabScrollerRTLNegative = /** @class */ (function (_super) {
      __extends(MDCTabScrollerRTLNegative, _super);
      function MDCTabScrollerRTLNegative() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      MDCTabScrollerRTLNegative.prototype.getScrollPositionRTL = function (translateX) {
          var currentScrollLeft = this.adapter_.getScrollAreaScrollLeft();
          return Math.round(translateX - currentScrollLeft);
      };
      MDCTabScrollerRTLNegative.prototype.scrollToRTL = function (scrollX) {
          var currentScrollLeft = this.adapter_.getScrollAreaScrollLeft();
          var clampedScrollLeft = this.clampScrollValue_(-scrollX);
          return {
              finalScrollPosition: clampedScrollLeft,
              scrollDelta: clampedScrollLeft - currentScrollLeft,
          };
      };
      MDCTabScrollerRTLNegative.prototype.incrementScrollRTL = function (scrollX) {
          var currentScrollLeft = this.adapter_.getScrollAreaScrollLeft();
          var clampedScrollLeft = this.clampScrollValue_(currentScrollLeft - scrollX);
          return {
              finalScrollPosition: clampedScrollLeft,
              scrollDelta: clampedScrollLeft - currentScrollLeft,
          };
      };
      MDCTabScrollerRTLNegative.prototype.getAnimatingScrollPosition = function (scrollX, translateX) {
          return scrollX - translateX;
      };
      MDCTabScrollerRTLNegative.prototype.calculateScrollEdges_ = function () {
          var contentWidth = this.adapter_.getScrollContentOffsetWidth();
          var rootWidth = this.adapter_.getScrollAreaOffsetWidth();
          return {
              left: rootWidth - contentWidth,
              right: 0,
          };
      };
      MDCTabScrollerRTLNegative.prototype.clampScrollValue_ = function (scrollX) {
          var edges = this.calculateScrollEdges_();
          return Math.max(Math.min(edges.right, scrollX), edges.left);
      };
      return MDCTabScrollerRTLNegative;
  }(MDCTabScrollerRTL));
  //# sourceMappingURL=rtl-negative-scroller.js.map

  /**
   * @license
   * Copyright 2018 Google Inc.
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in
   * all copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
   * THE SOFTWARE.
   */
  var MDCTabScrollerRTLReverse = /** @class */ (function (_super) {
      __extends(MDCTabScrollerRTLReverse, _super);
      function MDCTabScrollerRTLReverse() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      MDCTabScrollerRTLReverse.prototype.getScrollPositionRTL = function (translateX) {
          var currentScrollLeft = this.adapter_.getScrollAreaScrollLeft();
          // Scroll values on most browsers are ints instead of floats so we round
          return Math.round(currentScrollLeft - translateX);
      };
      MDCTabScrollerRTLReverse.prototype.scrollToRTL = function (scrollX) {
          var currentScrollLeft = this.adapter_.getScrollAreaScrollLeft();
          var clampedScrollLeft = this.clampScrollValue_(scrollX);
          return {
              finalScrollPosition: clampedScrollLeft,
              scrollDelta: currentScrollLeft - clampedScrollLeft,
          };
      };
      MDCTabScrollerRTLReverse.prototype.incrementScrollRTL = function (scrollX) {
          var currentScrollLeft = this.adapter_.getScrollAreaScrollLeft();
          var clampedScrollLeft = this.clampScrollValue_(currentScrollLeft + scrollX);
          return {
              finalScrollPosition: clampedScrollLeft,
              scrollDelta: currentScrollLeft - clampedScrollLeft,
          };
      };
      MDCTabScrollerRTLReverse.prototype.getAnimatingScrollPosition = function (scrollX, translateX) {
          return scrollX + translateX;
      };
      MDCTabScrollerRTLReverse.prototype.calculateScrollEdges_ = function () {
          var contentWidth = this.adapter_.getScrollContentOffsetWidth();
          var rootWidth = this.adapter_.getScrollAreaOffsetWidth();
          return {
              left: contentWidth - rootWidth,
              right: 0,
          };
      };
      MDCTabScrollerRTLReverse.prototype.clampScrollValue_ = function (scrollX) {
          var edges = this.calculateScrollEdges_();
          return Math.min(Math.max(edges.right, scrollX), edges.left);
      };
      return MDCTabScrollerRTLReverse;
  }(MDCTabScrollerRTL));
  //# sourceMappingURL=rtl-reverse-scroller.js.map

  /**
   * @license
   * Copyright 2018 Google Inc.
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in
   * all copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
   * THE SOFTWARE.
   */
  var MDCTabScrollerFoundation = /** @class */ (function (_super) {
      __extends(MDCTabScrollerFoundation, _super);
      function MDCTabScrollerFoundation(adapter) {
          var _this = _super.call(this, __assign({}, MDCTabScrollerFoundation.defaultAdapter, adapter)) || this;
          /**
           * Controls whether we should handle the transitionend and interaction events during the animation.
           */
          _this.isAnimating_ = false;
          return _this;
      }
      Object.defineProperty(MDCTabScrollerFoundation, "cssClasses", {
          get: function () {
              return cssClasses$8;
          },
          enumerable: true,
          configurable: true
      });
      Object.defineProperty(MDCTabScrollerFoundation, "strings", {
          get: function () {
              return strings$9;
          },
          enumerable: true,
          configurable: true
      });
      Object.defineProperty(MDCTabScrollerFoundation, "defaultAdapter", {
          get: function () {
              // tslint:disable:object-literal-sort-keys Methods should be in the same order as the adapter interface.
              return {
                  eventTargetMatchesSelector: function () { return false; },
                  addClass: function () { return undefined; },
                  removeClass: function () { return undefined; },
                  addScrollAreaClass: function () { return undefined; },
                  setScrollAreaStyleProperty: function () { return undefined; },
                  setScrollContentStyleProperty: function () { return undefined; },
                  getScrollContentStyleValue: function () { return ''; },
                  setScrollAreaScrollLeft: function () { return undefined; },
                  getScrollAreaScrollLeft: function () { return 0; },
                  getScrollContentOffsetWidth: function () { return 0; },
                  getScrollAreaOffsetWidth: function () { return 0; },
                  computeScrollAreaClientRect: function () { return ({ top: 0, right: 0, bottom: 0, left: 0, width: 0, height: 0 }); },
                  computeScrollContentClientRect: function () { return ({ top: 0, right: 0, bottom: 0, left: 0, width: 0, height: 0 }); },
                  computeHorizontalScrollbarHeight: function () { return 0; },
              };
              // tslint:enable:object-literal-sort-keys
          },
          enumerable: true,
          configurable: true
      });
      MDCTabScrollerFoundation.prototype.init = function () {
          // Compute horizontal scrollbar height on scroller with overflow initially hidden, then update overflow to scroll
          // and immediately adjust bottom margin to avoid the scrollbar initially appearing before JS runs.
          var horizontalScrollbarHeight = this.adapter_.computeHorizontalScrollbarHeight();
          this.adapter_.setScrollAreaStyleProperty('margin-bottom', -horizontalScrollbarHeight + 'px');
          this.adapter_.addScrollAreaClass(MDCTabScrollerFoundation.cssClasses.SCROLL_AREA_SCROLL);
      };
      /**
       * Computes the current visual scroll position
       */
      MDCTabScrollerFoundation.prototype.getScrollPosition = function () {
          if (this.isRTL_()) {
              return this.computeCurrentScrollPositionRTL_();
          }
          var currentTranslateX = this.calculateCurrentTranslateX_();
          var scrollLeft = this.adapter_.getScrollAreaScrollLeft();
          return scrollLeft - currentTranslateX;
      };
      /**
       * Handles interaction events that occur during transition
       */
      MDCTabScrollerFoundation.prototype.handleInteraction = function () {
          // Early exit if we aren't animating
          if (!this.isAnimating_) {
              return;
          }
          // Prevent other event listeners from handling this event
          this.stopScrollAnimation_();
      };
      /**
       * Handles the transitionend event
       */
      MDCTabScrollerFoundation.prototype.handleTransitionEnd = function (evt) {
          // Early exit if we aren't animating or the event was triggered by a different element.
          var evtTarget = evt.target;
          if (!this.isAnimating_ ||
              !this.adapter_.eventTargetMatchesSelector(evtTarget, MDCTabScrollerFoundation.strings.CONTENT_SELECTOR)) {
              return;
          }
          this.isAnimating_ = false;
          this.adapter_.removeClass(MDCTabScrollerFoundation.cssClasses.ANIMATING);
      };
      /**
       * Increment the scroll value by the scrollXIncrement
       * @param scrollXIncrement The value by which to increment the scroll position
       */
      MDCTabScrollerFoundation.prototype.incrementScroll = function (scrollXIncrement) {
          // Early exit for non-operational increment values
          if (scrollXIncrement === 0) {
              return;
          }
          if (this.isRTL_()) {
              return this.incrementScrollRTL_(scrollXIncrement);
          }
          this.incrementScroll_(scrollXIncrement);
      };
      /**
       * Scrolls to the given scrollX value
       */
      MDCTabScrollerFoundation.prototype.scrollTo = function (scrollX) {
          if (this.isRTL_()) {
              return this.scrollToRTL_(scrollX);
          }
          this.scrollTo_(scrollX);
      };
      /**
       * @return Browser-specific {@link MDCTabScrollerRTL} instance.
       */
      MDCTabScrollerFoundation.prototype.getRTLScroller = function () {
          if (!this.rtlScrollerInstance_) {
              this.rtlScrollerInstance_ = this.rtlScrollerFactory_();
          }
          return this.rtlScrollerInstance_;
      };
      /**
       * @return translateX value from a CSS matrix transform function string.
       */
      MDCTabScrollerFoundation.prototype.calculateCurrentTranslateX_ = function () {
          var transformValue = this.adapter_.getScrollContentStyleValue('transform');
          // Early exit if no transform is present
          if (transformValue === 'none') {
              return 0;
          }
          // The transform value comes back as a matrix transformation in the form
          // of `matrix(a, b, c, d, tx, ty)`. We only care about tx (translateX) so
          // we're going to grab all the parenthesized values, strip out tx, and
          // parse it.
          var match = /\((.+?)\)/.exec(transformValue);
          if (!match) {
              return 0;
          }
          var matrixParams = match[1];
          // tslint:disable-next-line:ban-ts-ignore "Unused vars" should be a linter warning, not a compiler error.
          // @ts-ignore These unused variables should retain their semantic names for clarity.
          var _a = __read(matrixParams.split(','), 6), a = _a[0], b = _a[1], c = _a[2], d = _a[3], tx = _a[4], ty = _a[5];
          return parseFloat(tx); // tslint:disable-line:ban
      };
      /**
       * Calculates a safe scroll value that is > 0 and < the max scroll value
       * @param scrollX The distance to scroll
       */
      MDCTabScrollerFoundation.prototype.clampScrollValue_ = function (scrollX) {
          var edges = this.calculateScrollEdges_();
          return Math.min(Math.max(edges.left, scrollX), edges.right);
      };
      MDCTabScrollerFoundation.prototype.computeCurrentScrollPositionRTL_ = function () {
          var translateX = this.calculateCurrentTranslateX_();
          return this.getRTLScroller().getScrollPositionRTL(translateX);
      };
      MDCTabScrollerFoundation.prototype.calculateScrollEdges_ = function () {
          var contentWidth = this.adapter_.getScrollContentOffsetWidth();
          var rootWidth = this.adapter_.getScrollAreaOffsetWidth();
          return {
              left: 0,
              right: contentWidth - rootWidth,
          };
      };
      /**
       * Internal scroll method
       * @param scrollX The new scroll position
       */
      MDCTabScrollerFoundation.prototype.scrollTo_ = function (scrollX) {
          var currentScrollX = this.getScrollPosition();
          var safeScrollX = this.clampScrollValue_(scrollX);
          var scrollDelta = safeScrollX - currentScrollX;
          this.animate_({
              finalScrollPosition: safeScrollX,
              scrollDelta: scrollDelta,
          });
      };
      /**
       * Internal RTL scroll method
       * @param scrollX The new scroll position
       */
      MDCTabScrollerFoundation.prototype.scrollToRTL_ = function (scrollX) {
          var animation = this.getRTLScroller().scrollToRTL(scrollX);
          this.animate_(animation);
      };
      /**
       * Internal increment scroll method
       * @param scrollX The new scroll position increment
       */
      MDCTabScrollerFoundation.prototype.incrementScroll_ = function (scrollX) {
          var currentScrollX = this.getScrollPosition();
          var targetScrollX = scrollX + currentScrollX;
          var safeScrollX = this.clampScrollValue_(targetScrollX);
          var scrollDelta = safeScrollX - currentScrollX;
          this.animate_({
              finalScrollPosition: safeScrollX,
              scrollDelta: scrollDelta,
          });
      };
      /**
       * Internal increment scroll RTL method
       * @param scrollX The new scroll position RTL increment
       */
      MDCTabScrollerFoundation.prototype.incrementScrollRTL_ = function (scrollX) {
          var animation = this.getRTLScroller().incrementScrollRTL(scrollX);
          this.animate_(animation);
      };
      /**
       * Animates the tab scrolling
       * @param animation The animation to apply
       */
      MDCTabScrollerFoundation.prototype.animate_ = function (animation) {
          var _this = this;
          // Early exit if translateX is 0, which means there's no animation to perform
          if (animation.scrollDelta === 0) {
              return;
          }
          this.stopScrollAnimation_();
          // This animation uses the FLIP approach.
          // Read more here: https://aerotwist.com/blog/flip-your-animations/
          this.adapter_.setScrollAreaScrollLeft(animation.finalScrollPosition);
          this.adapter_.setScrollContentStyleProperty('transform', "translateX(" + animation.scrollDelta + "px)");
          // Force repaint
          this.adapter_.computeScrollAreaClientRect();
          requestAnimationFrame(function () {
              _this.adapter_.addClass(MDCTabScrollerFoundation.cssClasses.ANIMATING);
              _this.adapter_.setScrollContentStyleProperty('transform', 'none');
          });
          this.isAnimating_ = true;
      };
      /**
       * Stops scroll animation
       */
      MDCTabScrollerFoundation.prototype.stopScrollAnimation_ = function () {
          this.isAnimating_ = false;
          var currentScrollPosition = this.getAnimatingScrollPosition_();
          this.adapter_.removeClass(MDCTabScrollerFoundation.cssClasses.ANIMATING);
          this.adapter_.setScrollContentStyleProperty('transform', 'translateX(0px)');
          this.adapter_.setScrollAreaScrollLeft(currentScrollPosition);
      };
      /**
       * Gets the current scroll position during animation
       */
      MDCTabScrollerFoundation.prototype.getAnimatingScrollPosition_ = function () {
          var currentTranslateX = this.calculateCurrentTranslateX_();
          var scrollLeft = this.adapter_.getScrollAreaScrollLeft();
          if (this.isRTL_()) {
              return this.getRTLScroller().getAnimatingScrollPosition(scrollLeft, currentTranslateX);
          }
          return scrollLeft - currentTranslateX;
      };
      /**
       * Determines the RTL Scroller to use
       */
      MDCTabScrollerFoundation.prototype.rtlScrollerFactory_ = function () {
          // Browsers have three different implementations of scrollLeft in RTL mode,
          // dependent on the browser. The behavior is based off the max LTR
          // scrollLeft value and 0.
          //
          // * Default scrolling in RTL *
          //    - Left-most value: 0
          //    - Right-most value: Max LTR scrollLeft value
          //
          // * Negative scrolling in RTL *
          //    - Left-most value: Negated max LTR scrollLeft value
          //    - Right-most value: 0
          //
          // * Reverse scrolling in RTL *
          //    - Left-most value: Max LTR scrollLeft value
          //    - Right-most value: 0
          //
          // We use those principles below to determine which RTL scrollLeft
          // behavior is implemented in the current browser.
          var initialScrollLeft = this.adapter_.getScrollAreaScrollLeft();
          this.adapter_.setScrollAreaScrollLeft(initialScrollLeft - 1);
          var newScrollLeft = this.adapter_.getScrollAreaScrollLeft();
          // If the newScrollLeft value is negative,then we know that the browser has
          // implemented negative RTL scrolling, since all other implementations have
          // only positive values.
          if (newScrollLeft < 0) {
              // Undo the scrollLeft test check
              this.adapter_.setScrollAreaScrollLeft(initialScrollLeft);
              return new MDCTabScrollerRTLNegative(this.adapter_);
          }
          var rootClientRect = this.adapter_.computeScrollAreaClientRect();
          var contentClientRect = this.adapter_.computeScrollContentClientRect();
          var rightEdgeDelta = Math.round(contentClientRect.right - rootClientRect.right);
          // Undo the scrollLeft test check
          this.adapter_.setScrollAreaScrollLeft(initialScrollLeft);
          // By calculating the clientRect of the root element and the clientRect of
          // the content element, we can determine how much the scroll value changed
          // when we performed the scrollLeft subtraction above.
          if (rightEdgeDelta === newScrollLeft) {
              return new MDCTabScrollerRTLReverse(this.adapter_);
          }
          return new MDCTabScrollerRTLDefault(this.adapter_);
      };
      MDCTabScrollerFoundation.prototype.isRTL_ = function () {
          return this.adapter_.getScrollContentStyleValue('direction') === 'rtl';
      };
      return MDCTabScrollerFoundation;
  }(MDCFoundation));
  //# sourceMappingURL=foundation.js.map

  /**
   * @license
   * Copyright 2018 Google Inc.
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in
   * all copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
   * THE SOFTWARE.
   */
  /**
   * Stores result from computeHorizontalScrollbarHeight to avoid redundant processing.
   */
  var horizontalScrollbarHeight_;
  /**
   * Computes the height of browser-rendered horizontal scrollbars using a self-created test element.
   * May return 0 (e.g. on OS X browsers under default configuration).
   */
  function computeHorizontalScrollbarHeight(documentObj, shouldCacheResult) {
      if (shouldCacheResult === void 0) { shouldCacheResult = true; }
      if (shouldCacheResult && typeof horizontalScrollbarHeight_ !== 'undefined') {
          return horizontalScrollbarHeight_;
      }
      var el = documentObj.createElement('div');
      el.classList.add(cssClasses$8.SCROLL_TEST);
      documentObj.body.appendChild(el);
      var horizontalScrollbarHeight = el.offsetHeight - el.clientHeight;
      documentObj.body.removeChild(el);
      if (shouldCacheResult) {
          horizontalScrollbarHeight_ = horizontalScrollbarHeight;
      }
      return horizontalScrollbarHeight;
  }
  //# sourceMappingURL=util.js.map

  /**
   * @license
   * Copyright 2018 Google Inc.
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in
   * all copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
   * THE SOFTWARE.
   */
  var MDCTabScroller = /** @class */ (function (_super) {
      __extends(MDCTabScroller, _super);
      function MDCTabScroller() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      MDCTabScroller.attachTo = function (root) {
          return new MDCTabScroller(root);
      };
      MDCTabScroller.prototype.initialize = function () {
          this.area_ = this.root_.querySelector(MDCTabScrollerFoundation.strings.AREA_SELECTOR);
          this.content_ = this.root_.querySelector(MDCTabScrollerFoundation.strings.CONTENT_SELECTOR);
      };
      MDCTabScroller.prototype.initialSyncWithDOM = function () {
          var _this = this;
          this.handleInteraction_ = function () { return _this.foundation_.handleInteraction(); };
          this.handleTransitionEnd_ = function (evt) { return _this.foundation_.handleTransitionEnd(evt); };
          this.area_.addEventListener('wheel', this.handleInteraction_, applyPassive());
          this.area_.addEventListener('touchstart', this.handleInteraction_, applyPassive());
          this.area_.addEventListener('pointerdown', this.handleInteraction_, applyPassive());
          this.area_.addEventListener('mousedown', this.handleInteraction_, applyPassive());
          this.area_.addEventListener('keydown', this.handleInteraction_, applyPassive());
          this.content_.addEventListener('transitionend', this.handleTransitionEnd_);
      };
      MDCTabScroller.prototype.destroy = function () {
          _super.prototype.destroy.call(this);
          this.area_.removeEventListener('wheel', this.handleInteraction_, applyPassive());
          this.area_.removeEventListener('touchstart', this.handleInteraction_, applyPassive());
          this.area_.removeEventListener('pointerdown', this.handleInteraction_, applyPassive());
          this.area_.removeEventListener('mousedown', this.handleInteraction_, applyPassive());
          this.area_.removeEventListener('keydown', this.handleInteraction_, applyPassive());
          this.content_.removeEventListener('transitionend', this.handleTransitionEnd_);
      };
      MDCTabScroller.prototype.getDefaultFoundation = function () {
          var _this = this;
          // DO NOT INLINE this variable. For backward compatibility, foundations take a Partial<MDCFooAdapter>.
          // To ensure we don't accidentally omit any methods, we need a separate, strongly typed adapter variable.
          // tslint:disable:object-literal-sort-keys Methods should be in the same order as the adapter interface.
          var adapter = {
              eventTargetMatchesSelector: function (evtTarget, selector) { return matches(evtTarget, selector); },
              addClass: function (className) { return _this.root_.classList.add(className); },
              removeClass: function (className) { return _this.root_.classList.remove(className); },
              addScrollAreaClass: function (className) { return _this.area_.classList.add(className); },
              setScrollAreaStyleProperty: function (prop, value) { return _this.area_.style.setProperty(prop, value); },
              setScrollContentStyleProperty: function (prop, value) { return _this.content_.style.setProperty(prop, value); },
              getScrollContentStyleValue: function (propName) { return window.getComputedStyle(_this.content_).getPropertyValue(propName); },
              setScrollAreaScrollLeft: function (scrollX) { return _this.area_.scrollLeft = scrollX; },
              getScrollAreaScrollLeft: function () { return _this.area_.scrollLeft; },
              getScrollContentOffsetWidth: function () { return _this.content_.offsetWidth; },
              getScrollAreaOffsetWidth: function () { return _this.area_.offsetWidth; },
              computeScrollAreaClientRect: function () { return _this.area_.getBoundingClientRect(); },
              computeScrollContentClientRect: function () { return _this.content_.getBoundingClientRect(); },
              computeHorizontalScrollbarHeight: function () { return computeHorizontalScrollbarHeight(document); },
          };
          // tslint:enable:object-literal-sort-keys
          return new MDCTabScrollerFoundation(adapter);
      };
      /**
       * Returns the current visual scroll position
       */
      MDCTabScroller.prototype.getScrollPosition = function () {
          return this.foundation_.getScrollPosition();
      };
      /**
       * Returns the width of the scroll content
       */
      MDCTabScroller.prototype.getScrollContentWidth = function () {
          return this.content_.offsetWidth;
      };
      /**
       * Increments the scroll value by the given amount
       * @param scrollXIncrement The pixel value by which to increment the scroll value
       */
      MDCTabScroller.prototype.incrementScroll = function (scrollXIncrement) {
          this.foundation_.incrementScroll(scrollXIncrement);
      };
      /**
       * Scrolls to the given pixel position
       * @param scrollX The pixel value to scroll to
       */
      MDCTabScroller.prototype.scrollTo = function (scrollX) {
          this.foundation_.scrollTo(scrollX);
      };
      return MDCTabScroller;
  }(MDCComponent));
  //# sourceMappingURL=component.js.map

  /**
   * @license
   * Copyright 2018 Google Inc.
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in
   * all copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
   * THE SOFTWARE.
   */
  var strings$a = {
      ARROW_LEFT_KEY: 'ArrowLeft',
      ARROW_RIGHT_KEY: 'ArrowRight',
      END_KEY: 'End',
      ENTER_KEY: 'Enter',
      HOME_KEY: 'Home',
      SPACE_KEY: 'Space',
      TAB_ACTIVATED_EVENT: 'MDCTabBar:activated',
      TAB_SCROLLER_SELECTOR: '.mdc-tab-scroller',
      TAB_SELECTOR: '.mdc-tab',
  };
  var numbers$3 = {
      ARROW_LEFT_KEYCODE: 37,
      ARROW_RIGHT_KEYCODE: 39,
      END_KEYCODE: 35,
      ENTER_KEYCODE: 13,
      EXTRA_SCROLL_AMOUNT: 20,
      HOME_KEYCODE: 36,
      SPACE_KEYCODE: 32,
  };
  //# sourceMappingURL=constants.js.map

  /**
   * @license
   * Copyright 2018 Google Inc.
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in
   * all copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
   * THE SOFTWARE.
   */
  var ACCEPTABLE_KEYS = new Set();
  // IE11 has no support for new Set with iterable so we need to initialize this by hand
  ACCEPTABLE_KEYS.add(strings$a.ARROW_LEFT_KEY);
  ACCEPTABLE_KEYS.add(strings$a.ARROW_RIGHT_KEY);
  ACCEPTABLE_KEYS.add(strings$a.END_KEY);
  ACCEPTABLE_KEYS.add(strings$a.HOME_KEY);
  ACCEPTABLE_KEYS.add(strings$a.ENTER_KEY);
  ACCEPTABLE_KEYS.add(strings$a.SPACE_KEY);
  var KEYCODE_MAP = new Map();
  // IE11 has no support for new Map with iterable so we need to initialize this by hand
  KEYCODE_MAP.set(numbers$3.ARROW_LEFT_KEYCODE, strings$a.ARROW_LEFT_KEY);
  KEYCODE_MAP.set(numbers$3.ARROW_RIGHT_KEYCODE, strings$a.ARROW_RIGHT_KEY);
  KEYCODE_MAP.set(numbers$3.END_KEYCODE, strings$a.END_KEY);
  KEYCODE_MAP.set(numbers$3.HOME_KEYCODE, strings$a.HOME_KEY);
  KEYCODE_MAP.set(numbers$3.ENTER_KEYCODE, strings$a.ENTER_KEY);
  KEYCODE_MAP.set(numbers$3.SPACE_KEYCODE, strings$a.SPACE_KEY);
  var MDCTabBarFoundation = /** @class */ (function (_super) {
      __extends(MDCTabBarFoundation, _super);
      function MDCTabBarFoundation(adapter) {
          var _this = _super.call(this, __assign({}, MDCTabBarFoundation.defaultAdapter, adapter)) || this;
          _this.useAutomaticActivation_ = false;
          return _this;
      }
      Object.defineProperty(MDCTabBarFoundation, "strings", {
          get: function () {
              return strings$a;
          },
          enumerable: true,
          configurable: true
      });
      Object.defineProperty(MDCTabBarFoundation, "numbers", {
          get: function () {
              return numbers$3;
          },
          enumerable: true,
          configurable: true
      });
      Object.defineProperty(MDCTabBarFoundation, "defaultAdapter", {
          get: function () {
              // tslint:disable:object-literal-sort-keys Methods should be in the same order as the adapter interface.
              return {
                  scrollTo: function () { return undefined; },
                  incrementScroll: function () { return undefined; },
                  getScrollPosition: function () { return 0; },
                  getScrollContentWidth: function () { return 0; },
                  getOffsetWidth: function () { return 0; },
                  isRTL: function () { return false; },
                  setActiveTab: function () { return undefined; },
                  activateTabAtIndex: function () { return undefined; },
                  deactivateTabAtIndex: function () { return undefined; },
                  focusTabAtIndex: function () { return undefined; },
                  getTabIndicatorClientRectAtIndex: function () { return ({ top: 0, right: 0, bottom: 0, left: 0, width: 0, height: 0 }); },
                  getTabDimensionsAtIndex: function () { return ({ rootLeft: 0, rootRight: 0, contentLeft: 0, contentRight: 0 }); },
                  getPreviousActiveTabIndex: function () { return -1; },
                  getFocusedTabIndex: function () { return -1; },
                  getIndexOfTabById: function () { return -1; },
                  getTabListLength: function () { return 0; },
                  notifyTabActivated: function () { return undefined; },
              };
              // tslint:enable:object-literal-sort-keys
          },
          enumerable: true,
          configurable: true
      });
      /**
       * Switches between automatic and manual activation modes.
       * See https://www.w3.org/TR/wai-aria-practices/#tabpanel for examples.
       */
      MDCTabBarFoundation.prototype.setUseAutomaticActivation = function (useAutomaticActivation) {
          this.useAutomaticActivation_ = useAutomaticActivation;
      };
      MDCTabBarFoundation.prototype.activateTab = function (index) {
          var previousActiveIndex = this.adapter_.getPreviousActiveTabIndex();
          if (!this.indexIsInRange_(index) || index === previousActiveIndex) {
              return;
          }
          var previousClientRect;
          if (previousActiveIndex !== -1) {
              this.adapter_.deactivateTabAtIndex(previousActiveIndex);
              previousClientRect = this.adapter_.getTabIndicatorClientRectAtIndex(previousActiveIndex);
          }
          this.adapter_.activateTabAtIndex(index, previousClientRect);
          this.scrollIntoView(index);
          this.adapter_.notifyTabActivated(index);
      };
      MDCTabBarFoundation.prototype.handleKeyDown = function (evt) {
          // Get the key from the event
          var key = this.getKeyFromEvent_(evt);
          // Early exit if the event key isn't one of the keyboard navigation keys
          if (key === undefined) {
              return;
          }
          // Prevent default behavior for movement keys, but not for activation keys, since :active is used to apply ripple
          if (!this.isActivationKey_(key)) {
              evt.preventDefault();
          }
          if (this.useAutomaticActivation_) {
              if (this.isActivationKey_(key)) {
                  return;
              }
              var index = this.determineTargetFromKey_(this.adapter_.getPreviousActiveTabIndex(), key);
              this.adapter_.setActiveTab(index);
              this.scrollIntoView(index);
          }
          else {
              var focusedTabIndex = this.adapter_.getFocusedTabIndex();
              if (this.isActivationKey_(key)) {
                  this.adapter_.setActiveTab(focusedTabIndex);
              }
              else {
                  var index = this.determineTargetFromKey_(focusedTabIndex, key);
                  this.adapter_.focusTabAtIndex(index);
                  this.scrollIntoView(index);
              }
          }
      };
      /**
       * Handles the MDCTab:interacted event
       */
      MDCTabBarFoundation.prototype.handleTabInteraction = function (evt) {
          this.adapter_.setActiveTab(this.adapter_.getIndexOfTabById(evt.detail.tabId));
      };
      /**
       * Scrolls the tab at the given index into view
       * @param index The tab index to make visible
       */
      MDCTabBarFoundation.prototype.scrollIntoView = function (index) {
          // Early exit if the index is out of range
          if (!this.indexIsInRange_(index)) {
              return;
          }
          // Always scroll to 0 if scrolling to the 0th index
          if (index === 0) {
              return this.adapter_.scrollTo(0);
          }
          // Always scroll to the max value if scrolling to the Nth index
          // MDCTabScroller.scrollTo() will never scroll past the max possible value
          if (index === this.adapter_.getTabListLength() - 1) {
              return this.adapter_.scrollTo(this.adapter_.getScrollContentWidth());
          }
          if (this.isRTL_()) {
              return this.scrollIntoViewRTL_(index);
          }
          this.scrollIntoView_(index);
      };
      /**
       * Private method for determining the index of the destination tab based on what key was pressed
       * @param origin The original index from which to determine the destination
       * @param key The name of the key
       */
      MDCTabBarFoundation.prototype.determineTargetFromKey_ = function (origin, key) {
          var isRTL = this.isRTL_();
          var maxIndex = this.adapter_.getTabListLength() - 1;
          var shouldGoToEnd = key === strings$a.END_KEY;
          var shouldDecrement = key === strings$a.ARROW_LEFT_KEY && !isRTL || key === strings$a.ARROW_RIGHT_KEY && isRTL;
          var shouldIncrement = key === strings$a.ARROW_RIGHT_KEY && !isRTL || key === strings$a.ARROW_LEFT_KEY && isRTL;
          var index = origin;
          if (shouldGoToEnd) {
              index = maxIndex;
          }
          else if (shouldDecrement) {
              index -= 1;
          }
          else if (shouldIncrement) {
              index += 1;
          }
          else {
              index = 0;
          }
          if (index < 0) {
              index = maxIndex;
          }
          else if (index > maxIndex) {
              index = 0;
          }
          return index;
      };
      /**
       * Calculates the scroll increment that will make the tab at the given index visible
       * @param index The index of the tab
       * @param nextIndex The index of the next tab
       * @param scrollPosition The current scroll position
       * @param barWidth The width of the Tab Bar
       */
      MDCTabBarFoundation.prototype.calculateScrollIncrement_ = function (index, nextIndex, scrollPosition, barWidth) {
          var nextTabDimensions = this.adapter_.getTabDimensionsAtIndex(nextIndex);
          var relativeContentLeft = nextTabDimensions.contentLeft - scrollPosition - barWidth;
          var relativeContentRight = nextTabDimensions.contentRight - scrollPosition;
          var leftIncrement = relativeContentRight - numbers$3.EXTRA_SCROLL_AMOUNT;
          var rightIncrement = relativeContentLeft + numbers$3.EXTRA_SCROLL_AMOUNT;
          if (nextIndex < index) {
              return Math.min(leftIncrement, 0);
          }
          return Math.max(rightIncrement, 0);
      };
      /**
       * Calculates the scroll increment that will make the tab at the given index visible in RTL
       * @param index The index of the tab
       * @param nextIndex The index of the next tab
       * @param scrollPosition The current scroll position
       * @param barWidth The width of the Tab Bar
       * @param scrollContentWidth The width of the scroll content
       */
      MDCTabBarFoundation.prototype.calculateScrollIncrementRTL_ = function (index, nextIndex, scrollPosition, barWidth, scrollContentWidth) {
          var nextTabDimensions = this.adapter_.getTabDimensionsAtIndex(nextIndex);
          var relativeContentLeft = scrollContentWidth - nextTabDimensions.contentLeft - scrollPosition;
          var relativeContentRight = scrollContentWidth - nextTabDimensions.contentRight - scrollPosition - barWidth;
          var leftIncrement = relativeContentRight + numbers$3.EXTRA_SCROLL_AMOUNT;
          var rightIncrement = relativeContentLeft - numbers$3.EXTRA_SCROLL_AMOUNT;
          if (nextIndex > index) {
              return Math.max(leftIncrement, 0);
          }
          return Math.min(rightIncrement, 0);
      };
      /**
       * Determines the index of the adjacent tab closest to either edge of the Tab Bar
       * @param index The index of the tab
       * @param tabDimensions The dimensions of the tab
       * @param scrollPosition The current scroll position
       * @param barWidth The width of the tab bar
       */
      MDCTabBarFoundation.prototype.findAdjacentTabIndexClosestToEdge_ = function (index, tabDimensions, scrollPosition, barWidth) {
          /**
           * Tabs are laid out in the Tab Scroller like this:
           *
           *    Scroll Position
           *    +---+
           *    |   |   Bar Width
           *    |   +-----------------------------------+
           *    |   |                                   |
           *    |   V                                   V
           *    |   +-----------------------------------+
           *    V   |             Tab Scroller          |
           *    +------------+--------------+-------------------+
           *    |    Tab     |      Tab     |        Tab        |
           *    +------------+--------------+-------------------+
           *        |                                   |
           *        +-----------------------------------+
           *
           * To determine the next adjacent index, we look at the Tab root left and
           * Tab root right, both relative to the scroll position. If the Tab root
           * left is less than 0, then we know it's out of view to the left. If the
           * Tab root right minus the bar width is greater than 0, we know the Tab is
           * out of view to the right. From there, we either increment or decrement
           * the index.
           */
          var relativeRootLeft = tabDimensions.rootLeft - scrollPosition;
          var relativeRootRight = tabDimensions.rootRight - scrollPosition - barWidth;
          var relativeRootDelta = relativeRootLeft + relativeRootRight;
          var leftEdgeIsCloser = relativeRootLeft < 0 || relativeRootDelta < 0;
          var rightEdgeIsCloser = relativeRootRight > 0 || relativeRootDelta > 0;
          if (leftEdgeIsCloser) {
              return index - 1;
          }
          if (rightEdgeIsCloser) {
              return index + 1;
          }
          return -1;
      };
      /**
       * Determines the index of the adjacent tab closest to either edge of the Tab Bar in RTL
       * @param index The index of the tab
       * @param tabDimensions The dimensions of the tab
       * @param scrollPosition The current scroll position
       * @param barWidth The width of the tab bar
       * @param scrollContentWidth The width of the scroller content
       */
      MDCTabBarFoundation.prototype.findAdjacentTabIndexClosestToEdgeRTL_ = function (index, tabDimensions, scrollPosition, barWidth, scrollContentWidth) {
          var rootLeft = scrollContentWidth - tabDimensions.rootLeft - barWidth - scrollPosition;
          var rootRight = scrollContentWidth - tabDimensions.rootRight - scrollPosition;
          var rootDelta = rootLeft + rootRight;
          var leftEdgeIsCloser = rootLeft > 0 || rootDelta > 0;
          var rightEdgeIsCloser = rootRight < 0 || rootDelta < 0;
          if (leftEdgeIsCloser) {
              return index + 1;
          }
          if (rightEdgeIsCloser) {
              return index - 1;
          }
          return -1;
      };
      /**
       * Returns the key associated with a keydown event
       * @param evt The keydown event
       */
      MDCTabBarFoundation.prototype.getKeyFromEvent_ = function (evt) {
          if (ACCEPTABLE_KEYS.has(evt.key)) {
              return evt.key;
          }
          return KEYCODE_MAP.get(evt.keyCode);
      };
      MDCTabBarFoundation.prototype.isActivationKey_ = function (key) {
          return key === strings$a.SPACE_KEY || key === strings$a.ENTER_KEY;
      };
      /**
       * Returns whether a given index is inclusively between the ends
       * @param index The index to test
       */
      MDCTabBarFoundation.prototype.indexIsInRange_ = function (index) {
          return index >= 0 && index < this.adapter_.getTabListLength();
      };
      /**
       * Returns the view's RTL property
       */
      MDCTabBarFoundation.prototype.isRTL_ = function () {
          return this.adapter_.isRTL();
      };
      /**
       * Scrolls the tab at the given index into view for left-to-right user agents.
       * @param index The index of the tab to scroll into view
       */
      MDCTabBarFoundation.prototype.scrollIntoView_ = function (index) {
          var scrollPosition = this.adapter_.getScrollPosition();
          var barWidth = this.adapter_.getOffsetWidth();
          var tabDimensions = this.adapter_.getTabDimensionsAtIndex(index);
          var nextIndex = this.findAdjacentTabIndexClosestToEdge_(index, tabDimensions, scrollPosition, barWidth);
          if (!this.indexIsInRange_(nextIndex)) {
              return;
          }
          var scrollIncrement = this.calculateScrollIncrement_(index, nextIndex, scrollPosition, barWidth);
          this.adapter_.incrementScroll(scrollIncrement);
      };
      /**
       * Scrolls the tab at the given index into view in RTL
       * @param index The tab index to make visible
       */
      MDCTabBarFoundation.prototype.scrollIntoViewRTL_ = function (index) {
          var scrollPosition = this.adapter_.getScrollPosition();
          var barWidth = this.adapter_.getOffsetWidth();
          var tabDimensions = this.adapter_.getTabDimensionsAtIndex(index);
          var scrollWidth = this.adapter_.getScrollContentWidth();
          var nextIndex = this.findAdjacentTabIndexClosestToEdgeRTL_(index, tabDimensions, scrollPosition, barWidth, scrollWidth);
          if (!this.indexIsInRange_(nextIndex)) {
              return;
          }
          var scrollIncrement = this.calculateScrollIncrementRTL_(index, nextIndex, scrollPosition, barWidth, scrollWidth);
          this.adapter_.incrementScroll(scrollIncrement);
      };
      return MDCTabBarFoundation;
  }(MDCFoundation));
  //# sourceMappingURL=foundation.js.map

  /**
   * @license
   * Copyright 2018 Google Inc.
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in
   * all copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
   * THE SOFTWARE.
   */
  var strings$b = MDCTabBarFoundation.strings;
  var tabIdCounter = 0;
  var MDCTabBar = /** @class */ (function (_super) {
      __extends(MDCTabBar, _super);
      function MDCTabBar() {
          return _super !== null && _super.apply(this, arguments) || this;
      }
      MDCTabBar.attachTo = function (root) {
          return new MDCTabBar(root);
      };
      Object.defineProperty(MDCTabBar.prototype, "focusOnActivate", {
          set: function (focusOnActivate) {
              this.tabList_.forEach(function (tab) { return tab.focusOnActivate = focusOnActivate; });
          },
          enumerable: true,
          configurable: true
      });
      Object.defineProperty(MDCTabBar.prototype, "useAutomaticActivation", {
          set: function (useAutomaticActivation) {
              this.foundation_.setUseAutomaticActivation(useAutomaticActivation);
          },
          enumerable: true,
          configurable: true
      });
      MDCTabBar.prototype.initialize = function (tabFactory, tabScrollerFactory) {
          if (tabFactory === void 0) { tabFactory = function (el) { return new MDCTab(el); }; }
          if (tabScrollerFactory === void 0) { tabScrollerFactory = function (el) { return new MDCTabScroller(el); }; }
          this.tabList_ = this.instantiateTabs_(tabFactory);
          this.tabScroller_ = this.instantiateTabScroller_(tabScrollerFactory);
      };
      MDCTabBar.prototype.initialSyncWithDOM = function () {
          var _this = this;
          this.handleTabInteraction_ = function (evt) { return _this.foundation_.handleTabInteraction(evt); };
          this.handleKeyDown_ = function (evt) { return _this.foundation_.handleKeyDown(evt); };
          this.listen(MDCTabFoundation.strings.INTERACTED_EVENT, this.handleTabInteraction_);
          this.listen('keydown', this.handleKeyDown_);
          for (var i = 0; i < this.tabList_.length; i++) {
              if (this.tabList_[i].active) {
                  this.scrollIntoView(i);
                  break;
              }
          }
      };
      MDCTabBar.prototype.destroy = function () {
          _super.prototype.destroy.call(this);
          this.unlisten(MDCTabFoundation.strings.INTERACTED_EVENT, this.handleTabInteraction_);
          this.unlisten('keydown', this.handleKeyDown_);
          this.tabList_.forEach(function (tab) { return tab.destroy(); });
          if (this.tabScroller_) {
              this.tabScroller_.destroy();
          }
      };
      MDCTabBar.prototype.getDefaultFoundation = function () {
          var _this = this;
          // DO NOT INLINE this variable. For backward compatibility, foundations take a Partial<MDCFooAdapter>.
          // To ensure we don't accidentally omit any methods, we need a separate, strongly typed adapter variable.
          // tslint:disable:object-literal-sort-keys Methods should be in the same order as the adapter interface.
          var adapter = {
              scrollTo: function (scrollX) { return _this.tabScroller_.scrollTo(scrollX); },
              incrementScroll: function (scrollXIncrement) { return _this.tabScroller_.incrementScroll(scrollXIncrement); },
              getScrollPosition: function () { return _this.tabScroller_.getScrollPosition(); },
              getScrollContentWidth: function () { return _this.tabScroller_.getScrollContentWidth(); },
              getOffsetWidth: function () { return _this.root_.offsetWidth; },
              isRTL: function () { return window.getComputedStyle(_this.root_).getPropertyValue('direction') === 'rtl'; },
              setActiveTab: function (index) { return _this.foundation_.activateTab(index); },
              activateTabAtIndex: function (index, clientRect) { return _this.tabList_[index].activate(clientRect); },
              deactivateTabAtIndex: function (index) { return _this.tabList_[index].deactivate(); },
              focusTabAtIndex: function (index) { return _this.tabList_[index].focus(); },
              getTabIndicatorClientRectAtIndex: function (index) { return _this.tabList_[index].computeIndicatorClientRect(); },
              getTabDimensionsAtIndex: function (index) { return _this.tabList_[index].computeDimensions(); },
              getPreviousActiveTabIndex: function () {
                  for (var i = 0; i < _this.tabList_.length; i++) {
                      if (_this.tabList_[i].active) {
                          return i;
                      }
                  }
                  return -1;
              },
              getFocusedTabIndex: function () {
                  var tabElements = _this.getTabElements_();
                  var activeElement = document.activeElement;
                  return tabElements.indexOf(activeElement);
              },
              getIndexOfTabById: function (id) {
                  for (var i = 0; i < _this.tabList_.length; i++) {
                      if (_this.tabList_[i].id === id) {
                          return i;
                      }
                  }
                  return -1;
              },
              getTabListLength: function () { return _this.tabList_.length; },
              notifyTabActivated: function (index) {
                  return _this.emit(strings$b.TAB_ACTIVATED_EVENT, { index: index }, true);
              },
          };
          // tslint:enable:object-literal-sort-keys
          return new MDCTabBarFoundation(adapter);
      };
      /**
       * Activates the tab at the given index
       * @param index The index of the tab
       */
      MDCTabBar.prototype.activateTab = function (index) {
          this.foundation_.activateTab(index);
      };
      /**
       * Scrolls the tab at the given index into view
       * @param index THe index of the tab
       */
      MDCTabBar.prototype.scrollIntoView = function (index) {
          this.foundation_.scrollIntoView(index);
      };
      /**
       * Returns all the tab elements in a nice clean array
       */
      MDCTabBar.prototype.getTabElements_ = function () {
          return [].slice.call(this.root_.querySelectorAll(strings$b.TAB_SELECTOR));
      };
      /**
       * Instantiates tab components on all child tab elements
       */
      MDCTabBar.prototype.instantiateTabs_ = function (tabFactory) {
          return this.getTabElements_().map(function (el) {
              el.id = el.id || "mdc-tab-" + ++tabIdCounter;
              return tabFactory(el);
          });
      };
      /**
       * Instantiates tab scroller component on the child tab scroller element
       */
      MDCTabBar.prototype.instantiateTabScroller_ = function (tabScrollerFactory) {
          var tabScrollerElement = this.root_.querySelector(strings$b.TAB_SCROLLER_SELECTOR);
          if (tabScrollerElement) {
              return tabScrollerFactory(tabScrollerElement);
          }
          return null;
      };
      return MDCTabBar;
  }(MDCComponent));
  //# sourceMappingURL=component.js.map

  /* node_modules/@smui/tab-scroller/TabScroller.svelte generated by Svelte v3.18.1 */

  function create_fragment$v(ctx) {
  	let div2;
  	let div1;
  	let div0;
  	let useActions_action;
  	let useActions_action_1;
  	let useActions_action_2;
  	let forwardEvents_action;
  	let current;
  	let dispose;
  	const default_slot_template = /*$$slots*/ ctx[17].default;
  	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[16], null);

  	let div0_levels = [
  		{
  			class: "mdc-tab-scroller__scroll-content " + /*scrollContent$class*/ ctx[5]
  		},
  		exclude(prefixFilter(/*$$props*/ ctx[8], "scrollContent$"), ["use", "class"])
  	];

  	let div0_data = {};

  	for (let i = 0; i < div0_levels.length; i += 1) {
  		div0_data = assign(div0_data, div0_levels[i]);
  	}

  	let div1_levels = [
  		{
  			class: "mdc-tab-scroller__scroll-area " + /*scrollArea$class*/ ctx[3]
  		},
  		exclude(prefixFilter(/*$$props*/ ctx[8], "scrollArea$"), ["use", "class"])
  	];

  	let div1_data = {};

  	for (let i = 0; i < div1_levels.length; i += 1) {
  		div1_data = assign(div1_data, div1_levels[i]);
  	}

  	let div2_levels = [
  		{
  			class: "mdc-tab-scroller " + /*className*/ ctx[1]
  		},
  		exclude(/*$$props*/ ctx[8], ["use", "class", "scrollArea$", "scrollContent$"])
  	];

  	let div2_data = {};

  	for (let i = 0; i < div2_levels.length; i += 1) {
  		div2_data = assign(div2_data, div2_levels[i]);
  	}

  	return {
  		c() {
  			div2 = element("div");
  			div1 = element("div");
  			div0 = element("div");
  			if (default_slot) default_slot.c();
  			set_attributes(div0, div0_data);
  			set_attributes(div1, div1_data);
  			set_attributes(div2, div2_data);
  		},
  		m(target, anchor) {
  			insert(target, div2, anchor);
  			append(div2, div1);
  			append(div1, div0);

  			if (default_slot) {
  				default_slot.m(div0, null);
  			}

  			/*div2_binding*/ ctx[18](div2);
  			current = true;

  			dispose = [
  				action_destroyer(useActions_action = useActions.call(null, div0, /*scrollContent$use*/ ctx[4])),
  				action_destroyer(useActions_action_1 = useActions.call(null, div1, /*scrollArea$use*/ ctx[2])),
  				action_destroyer(useActions_action_2 = useActions.call(null, div2, /*use*/ ctx[0])),
  				action_destroyer(forwardEvents_action = /*forwardEvents*/ ctx[7].call(null, div2))
  			];
  		},
  		p(ctx, [dirty]) {
  			if (default_slot && default_slot.p && dirty & /*$$scope*/ 65536) {
  				default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[16], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[16], dirty, null));
  			}

  			set_attributes(div0, get_spread_update(div0_levels, [
  				dirty & /*scrollContent$class*/ 32 && {
  					class: "mdc-tab-scroller__scroll-content " + /*scrollContent$class*/ ctx[5]
  				},
  				dirty & /*exclude, prefixFilter, $$props*/ 256 && exclude(prefixFilter(/*$$props*/ ctx[8], "scrollContent$"), ["use", "class"])
  			]));

  			if (useActions_action && is_function(useActions_action.update) && dirty & /*scrollContent$use*/ 16) useActions_action.update.call(null, /*scrollContent$use*/ ctx[4]);

  			set_attributes(div1, get_spread_update(div1_levels, [
  				dirty & /*scrollArea$class*/ 8 && {
  					class: "mdc-tab-scroller__scroll-area " + /*scrollArea$class*/ ctx[3]
  				},
  				dirty & /*exclude, prefixFilter, $$props*/ 256 && exclude(prefixFilter(/*$$props*/ ctx[8], "scrollArea$"), ["use", "class"])
  			]));

  			if (useActions_action_1 && is_function(useActions_action_1.update) && dirty & /*scrollArea$use*/ 4) useActions_action_1.update.call(null, /*scrollArea$use*/ ctx[2]);

  			set_attributes(div2, get_spread_update(div2_levels, [
  				dirty & /*className*/ 2 && {
  					class: "mdc-tab-scroller " + /*className*/ ctx[1]
  				},
  				dirty & /*exclude, $$props*/ 256 && exclude(/*$$props*/ ctx[8], ["use", "class", "scrollArea$", "scrollContent$"])
  			]));

  			if (useActions_action_2 && is_function(useActions_action_2.update) && dirty & /*use*/ 1) useActions_action_2.update.call(null, /*use*/ ctx[0]);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(default_slot, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(default_slot, local);
  			current = false;
  		},
  		d(detaching) {
  			if (detaching) detach(div2);
  			if (default_slot) default_slot.d(detaching);
  			/*div2_binding*/ ctx[18](null);
  			run_all(dispose);
  		}
  	};
  }

  function instance$r($$self, $$props, $$invalidate) {
  	const forwardEvents = forwardEventsBuilder(current_component);
  	let { use = [] } = $$props;
  	let { class: className = "" } = $$props;
  	let { scrollArea$use = [] } = $$props;
  	let { scrollArea$class = "" } = $$props;
  	let { scrollContent$use = [] } = $$props;
  	let { scrollContent$class = "" } = $$props;
  	let element;
  	let tabScroller;
  	let instantiate = getContext("SMUI:tab-scroller:instantiate");
  	let getInstance = getContext("SMUI:tab-scroller:getInstance");

  	onMount(async () => {
  		if (instantiate !== false) {
  			tabScroller = new MDCTabScroller(element);
  		} else {
  			tabScroller = await getInstance();
  		}
  	});

  	onDestroy(() => {
  		tabScroller && tabScroller.destroy();
  	});

  	function scrollTo(...args) {
  		return tabScroller.scrollTo(...args);
  	}

  	function incrementScroll(...args) {
  		return tabScroller.incrementScroll(...args);
  	}

  	function getScrollPosition(...args) {
  		return tabScroller.getScrollPosition(...args);
  	}

  	function getScrollContentWidth(...args) {
  		return tabScroller.getScrollContentWidth(...args);
  	}

  	let { $$slots = {}, $$scope } = $$props;

  	function div2_binding($$value) {
  		binding_callbacks[$$value ? "unshift" : "push"](() => {
  			$$invalidate(6, element = $$value);
  		});
  	}

  	$$self.$set = $$new_props => {
  		$$invalidate(8, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
  		if ("use" in $$new_props) $$invalidate(0, use = $$new_props.use);
  		if ("class" in $$new_props) $$invalidate(1, className = $$new_props.class);
  		if ("scrollArea$use" in $$new_props) $$invalidate(2, scrollArea$use = $$new_props.scrollArea$use);
  		if ("scrollArea$class" in $$new_props) $$invalidate(3, scrollArea$class = $$new_props.scrollArea$class);
  		if ("scrollContent$use" in $$new_props) $$invalidate(4, scrollContent$use = $$new_props.scrollContent$use);
  		if ("scrollContent$class" in $$new_props) $$invalidate(5, scrollContent$class = $$new_props.scrollContent$class);
  		if ("$$scope" in $$new_props) $$invalidate(16, $$scope = $$new_props.$$scope);
  	};

  	$$props = exclude_internal_props($$props);

  	return [
  		use,
  		className,
  		scrollArea$use,
  		scrollArea$class,
  		scrollContent$use,
  		scrollContent$class,
  		element,
  		forwardEvents,
  		$$props,
  		scrollTo,
  		incrementScroll,
  		getScrollPosition,
  		getScrollContentWidth,
  		tabScroller,
  		instantiate,
  		getInstance,
  		$$scope,
  		$$slots,
  		div2_binding
  	];
  }

  class TabScroller extends SvelteComponent {
  	constructor(options) {
  		super();

  		init(this, options, instance$r, create_fragment$v, safe_not_equal, {
  			use: 0,
  			class: 1,
  			scrollArea$use: 2,
  			scrollArea$class: 3,
  			scrollContent$use: 4,
  			scrollContent$class: 5,
  			scrollTo: 9,
  			incrementScroll: 10,
  			getScrollPosition: 11,
  			getScrollContentWidth: 12
  		});
  	}

  	get scrollTo() {
  		return this.$$.ctx[9];
  	}

  	get incrementScroll() {
  		return this.$$.ctx[10];
  	}

  	get getScrollPosition() {
  		return this.$$.ctx[11];
  	}

  	get getScrollContentWidth() {
  		return this.$$.ctx[12];
  	}
  }

  /* node_modules/@smui/tab-bar/TabBar.svelte generated by Svelte v3.18.1 */
  const get_default_slot_changes = dirty => ({ tab: dirty & /*tabs*/ 4 });
  const get_default_slot_context = ctx => ({ tab: /*tab*/ ctx[28] });

  function get_each_context(ctx, list, i) {
  	const child_ctx = ctx.slice();
  	child_ctx[28] = list[i];
  	child_ctx[30] = i;
  	return child_ctx;
  }

  // (13:4) {#each tabs as tab, i (key(tab))}
  function create_each_block(key_2, ctx) {
  	let first;
  	let current;
  	const default_slot_template = /*$$slots*/ ctx[25].default;
  	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[27], get_default_slot_context);

  	return {
  		key: key_2,
  		first: null,
  		c() {
  			first = empty();
  			if (default_slot) default_slot.c();
  			this.first = first;
  		},
  		m(target, anchor) {
  			insert(target, first, anchor);

  			if (default_slot) {
  				default_slot.m(target, anchor);
  			}

  			current = true;
  		},
  		p(ctx, dirty) {
  			if (default_slot && default_slot.p && dirty & /*$$scope, tabs*/ 134217732) {
  				default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[27], get_default_slot_context), get_slot_changes(default_slot_template, /*$$scope*/ ctx[27], dirty, get_default_slot_changes));
  			}
  		},
  		i(local) {
  			if (current) return;
  			transition_in(default_slot, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(default_slot, local);
  			current = false;
  		},
  		d(detaching) {
  			if (detaching) detach(first);
  			if (default_slot) default_slot.d(detaching);
  		}
  	};
  }

  // (10:2) <TabScroller     {...prefixFilter($$props, 'tabScroller$')}   >
  function create_default_slot$8(ctx) {
  	let each_blocks = [];
  	let each_1_lookup = new Map();
  	let each_1_anchor;
  	let current;
  	let each_value = /*tabs*/ ctx[2];
  	const get_key = ctx => /*key*/ ctx[3](/*tab*/ ctx[28]);

  	for (let i = 0; i < each_value.length; i += 1) {
  		let child_ctx = get_each_context(ctx, each_value, i);
  		let key = get_key(child_ctx);
  		each_1_lookup.set(key, each_blocks[i] = create_each_block(key, child_ctx));
  	}

  	return {
  		c() {
  			for (let i = 0; i < each_blocks.length; i += 1) {
  				each_blocks[i].c();
  			}

  			each_1_anchor = empty();
  		},
  		m(target, anchor) {
  			for (let i = 0; i < each_blocks.length; i += 1) {
  				each_blocks[i].m(target, anchor);
  			}

  			insert(target, each_1_anchor, anchor);
  			current = true;
  		},
  		p(ctx, dirty) {
  			const each_value = /*tabs*/ ctx[2];
  			group_outros();
  			each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each_1_lookup, each_1_anchor.parentNode, outro_and_destroy_block, create_each_block, each_1_anchor, get_each_context);
  			check_outros();
  		},
  		i(local) {
  			if (current) return;

  			for (let i = 0; i < each_value.length; i += 1) {
  				transition_in(each_blocks[i]);
  			}

  			current = true;
  		},
  		o(local) {
  			for (let i = 0; i < each_blocks.length; i += 1) {
  				transition_out(each_blocks[i]);
  			}

  			current = false;
  		},
  		d(detaching) {
  			for (let i = 0; i < each_blocks.length; i += 1) {
  				each_blocks[i].d(detaching);
  			}

  			if (detaching) detach(each_1_anchor);
  		}
  	};
  }

  function create_fragment$w(ctx) {
  	let div;
  	let useActions_action;
  	let forwardEvents_action;
  	let current;
  	let dispose;
  	const tabscroller_spread_levels = [prefixFilter(/*$$props*/ ctx[7], "tabScroller$")];

  	let tabscroller_props = {
  		$$slots: { default: [create_default_slot$8] },
  		$$scope: { ctx }
  	};

  	for (let i = 0; i < tabscroller_spread_levels.length; i += 1) {
  		tabscroller_props = assign(tabscroller_props, tabscroller_spread_levels[i]);
  	}

  	const tabscroller = new TabScroller({ props: tabscroller_props });

  	let div_levels = [
  		{
  			class: "mdc-tab-bar " + /*className*/ ctx[1]
  		},
  		{ role: "tablist" },
  		exclude(/*$$props*/ ctx[7], [
  			"use",
  			"class",
  			"tabs",
  			"key",
  			"focusOnActivate",
  			"useAutomaticActivation",
  			"activeIndex",
  			"tabScroller$"
  		])
  	];

  	let div_data = {};

  	for (let i = 0; i < div_levels.length; i += 1) {
  		div_data = assign(div_data, div_levels[i]);
  	}

  	return {
  		c() {
  			div = element("div");
  			create_component(tabscroller.$$.fragment);
  			set_attributes(div, div_data);
  		},
  		m(target, anchor) {
  			insert(target, div, anchor);
  			mount_component(tabscroller, div, null);
  			/*div_binding*/ ctx[26](div);
  			current = true;

  			dispose = [
  				action_destroyer(useActions_action = useActions.call(null, div, /*use*/ ctx[0])),
  				action_destroyer(forwardEvents_action = /*forwardEvents*/ ctx[5].call(null, div)),
  				listen(div, "MDCTabBar:activated", /*activatedHandler*/ ctx[6])
  			];
  		},
  		p(ctx, [dirty]) {
  			const tabscroller_changes = (dirty & /*prefixFilter, $$props*/ 128)
  			? get_spread_update(tabscroller_spread_levels, [get_spread_object(prefixFilter(/*$$props*/ ctx[7], "tabScroller$"))])
  			: {};

  			if (dirty & /*$$scope, tabs*/ 134217732) {
  				tabscroller_changes.$$scope = { dirty, ctx };
  			}

  			tabscroller.$set(tabscroller_changes);

  			set_attributes(div, get_spread_update(div_levels, [
  				dirty & /*className*/ 2 && {
  					class: "mdc-tab-bar " + /*className*/ ctx[1]
  				},
  				{ role: "tablist" },
  				dirty & /*exclude, $$props*/ 128 && exclude(/*$$props*/ ctx[7], [
  					"use",
  					"class",
  					"tabs",
  					"key",
  					"focusOnActivate",
  					"useAutomaticActivation",
  					"activeIndex",
  					"tabScroller$"
  				])
  			]));

  			if (useActions_action && is_function(useActions_action.update) && dirty & /*use*/ 1) useActions_action.update.call(null, /*use*/ ctx[0]);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(tabscroller.$$.fragment, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(tabscroller.$$.fragment, local);
  			current = false;
  		},
  		d(detaching) {
  			if (detaching) detach(div);
  			destroy_component(tabscroller);
  			/*div_binding*/ ctx[26](null);
  			run_all(dispose);
  		}
  	};
  }

  function instance$s($$self, $$props, $$invalidate) {
  	const forwardEvents = forwardEventsBuilder(current_component, ["MDCTabBar:activated"]);

  	let uninitializedValue = () => {
  		
  	};

  	let { use = [] } = $$props;
  	let { class: className = "" } = $$props;
  	let { tabs = [] } = $$props;
  	let { key = tab => tab } = $$props;
  	let { focusOnActivate = true } = $$props;
  	let { useAutomaticActivation = true } = $$props;
  	let { activeIndex = uninitializedValue } = $$props;
  	let { active = uninitializedValue } = $$props;

  	if (activeIndex === uninitializedValue && active === uninitializedValue) {
  		activeIndex = 0;
  		active = tabs[0];
  	} else if (activeIndex === uninitializedValue) {
  		activeIndex = tabs.indexOf(active);
  	} else if (active === uninitializedValue) {
  		active = tabs[activeIndex];
  	}

  	let element;
  	let tabBar;
  	let tabScrollerPromiseResolve;
  	let tabScrollerPromise = new Promise(resolve => tabScrollerPromiseResolve = resolve);
  	let tabPromiseResolve = [];
  	let tabPromise = tabs.map((tab, i) => new Promise(resolve => tabPromiseResolve[i] = resolve));
  	setContext("SMUI:tab-scroller:instantiate", false);
  	setContext("SMUI:tab-scroller:getInstance", getTabScrollerInstancePromise);
  	setContext("SMUI:tab:instantiate", false);
  	setContext("SMUI:tab:getInstance", getTabInstancePromise);
  	setContext("SMUI:tab:active", active);
  	let previousActiveIndex = activeIndex;
  	let previousActive = active;

  	onMount(() => {
  		$$invalidate(14, tabBar = new MDCTabBar(element));
  		tabScrollerPromiseResolve(tabBar.tabScroller_);

  		for (let i = 0; i < tabs.length; i++) {
  			tabPromiseResolve[i](tabBar.tabList_[i]);
  		}
  	});

  	onDestroy(() => {
  		tabBar && tabBar.destroy();
  	});

  	function getTabScrollerInstancePromise() {
  		return tabScrollerPromise;
  	}

  	function getTabInstancePromise(tabEntry) {
  		return tabPromise[tabs.indexOf(tabEntry)];
  	}

  	function updateIndexAfterActivate(index) {
  		$$invalidate(8, activeIndex = index);
  		$$invalidate(17, previousActiveIndex = index);
  		$$invalidate(9, active = tabs[index]);
  		$$invalidate(18, previousActive = tabs[index]);
  	}

  	function activatedHandler(e) {
  		updateIndexAfterActivate(e.detail.index);
  	}

  	function activateTab(index, ...args) {
  		updateIndexAfterActivate(index);
  		return tabBar.activateTab(index, ...args);
  	}

  	function scrollIntoView(...args) {
  		return tabBar.scrollIntoView(...args);
  	}

  	let { $$slots = {}, $$scope } = $$props;

  	function div_binding($$value) {
  		binding_callbacks[$$value ? "unshift" : "push"](() => {
  			$$invalidate(4, element = $$value);
  		});
  	}

  	$$self.$set = $$new_props => {
  		$$invalidate(7, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
  		if ("use" in $$new_props) $$invalidate(0, use = $$new_props.use);
  		if ("class" in $$new_props) $$invalidate(1, className = $$new_props.class);
  		if ("tabs" in $$new_props) $$invalidate(2, tabs = $$new_props.tabs);
  		if ("key" in $$new_props) $$invalidate(3, key = $$new_props.key);
  		if ("focusOnActivate" in $$new_props) $$invalidate(10, focusOnActivate = $$new_props.focusOnActivate);
  		if ("useAutomaticActivation" in $$new_props) $$invalidate(11, useAutomaticActivation = $$new_props.useAutomaticActivation);
  		if ("activeIndex" in $$new_props) $$invalidate(8, activeIndex = $$new_props.activeIndex);
  		if ("active" in $$new_props) $$invalidate(9, active = $$new_props.active);
  		if ("$$scope" in $$new_props) $$invalidate(27, $$scope = $$new_props.$$scope);
  	};

  	$$self.$$.update = () => {
  		if ($$self.$$.dirty & /*tabBar, focusOnActivate*/ 17408) {
  			 if (tabBar) {
  				$$invalidate(14, tabBar.focusOnActivate = focusOnActivate, tabBar);
  			}
  		}

  		if ($$self.$$.dirty & /*tabBar, useAutomaticActivation*/ 18432) {
  			 if (tabBar) {
  				$$invalidate(14, tabBar.useAutomaticActivation = useAutomaticActivation, tabBar);
  			}
  		}

  		if ($$self.$$.dirty & /*tabBar, tabs, activeIndex*/ 16644) {
  			 if (tabBar) {
  				$$invalidate(9, active = tabs[activeIndex]);
  			}
  		}

  		if ($$self.$$.dirty & /*tabBar, previousActiveIndex, activeIndex*/ 147712) {
  			 if (tabBar && previousActiveIndex !== activeIndex) {
  				activateTab(activeIndex);
  			}
  		}

  		if ($$self.$$.dirty & /*tabBar, previousActive, active, tabs*/ 279044) {
  			 if (tabBar && previousActive !== active) {
  				activateTab(tabs.indexOf(active));
  			}
  		}
  	};

  	$$props = exclude_internal_props($$props);

  	return [
  		use,
  		className,
  		tabs,
  		key,
  		element,
  		forwardEvents,
  		activatedHandler,
  		$$props,
  		activeIndex,
  		active,
  		focusOnActivate,
  		useAutomaticActivation,
  		activateTab,
  		scrollIntoView,
  		tabBar,
  		tabScrollerPromiseResolve,
  		tabPromiseResolve,
  		previousActiveIndex,
  		previousActive,
  		uninitializedValue,
  		tabScrollerPromise,
  		tabPromise,
  		getTabScrollerInstancePromise,
  		getTabInstancePromise,
  		updateIndexAfterActivate,
  		$$slots,
  		div_binding,
  		$$scope
  	];
  }

  class TabBar extends SvelteComponent {
  	constructor(options) {
  		super();

  		init(this, options, instance$s, create_fragment$w, safe_not_equal, {
  			use: 0,
  			class: 1,
  			tabs: 2,
  			key: 3,
  			focusOnActivate: 10,
  			useAutomaticActivation: 11,
  			activeIndex: 8,
  			active: 9,
  			activateTab: 12,
  			scrollIntoView: 13
  		});
  	}

  	get activateTab() {
  		return this.$$.ctx[12];
  	}

  	get scrollIntoView() {
  		return this.$$.ctx[13];
  	}
  }

  /* src/routes/Questions.svelte generated by Svelte v3.18.1 */

  function create_default_slot_7(ctx) {
  	let t;

  	return {
  		c() {
  			t = text("intrapersonal");
  		},
  		m(target, anchor) {
  			insert(target, t, anchor);
  		},
  		d(detaching) {
  			if (detaching) detach(t);
  		}
  	};
  }

  // (28:4) <Button on:click={() => (keyedTabsActive = keyedTabs[0])}>
  function create_default_slot_6(ctx) {
  	let current;

  	const label = new Label({
  			props: {
  				$$slots: { default: [create_default_slot_7] },
  				$$scope: { ctx }
  			}
  		});

  	return {
  		c() {
  			create_component(label.$$.fragment);
  		},
  		m(target, anchor) {
  			mount_component(label, target, anchor);
  			current = true;
  		},
  		p(ctx, dirty) {
  			const label_changes = {};

  			if (dirty & /*$$scope*/ 64) {
  				label_changes.$$scope = { dirty, ctx };
  			}

  			label.$set(label_changes);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(label.$$.fragment, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(label.$$.fragment, local);
  			current = false;
  		},
  		d(detaching) {
  			destroy_component(label, detaching);
  		}
  	};
  }

  // (33:6) <Label>
  function create_default_slot_5$2(ctx) {
  	let t;

  	return {
  		c() {
  			t = text("interpersonal");
  		},
  		m(target, anchor) {
  			insert(target, t, anchor);
  		},
  		d(detaching) {
  			if (detaching) detach(t);
  		}
  	};
  }

  // (32:4) <Button on:click={() => (keyedTabsActive = keyedTabs[1])}>
  function create_default_slot_4$2(ctx) {
  	let current;

  	const label = new Label({
  			props: {
  				$$slots: { default: [create_default_slot_5$2] },
  				$$scope: { ctx }
  			}
  		});

  	return {
  		c() {
  			create_component(label.$$.fragment);
  		},
  		m(target, anchor) {
  			mount_component(label, target, anchor);
  			current = true;
  		},
  		p(ctx, dirty) {
  			const label_changes = {};

  			if (dirty & /*$$scope*/ 64) {
  				label_changes.$$scope = { dirty, ctx };
  			}

  			label.$set(label_changes);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(label.$$.fragment, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(label.$$.fragment, local);
  			current = false;
  		},
  		d(detaching) {
  			destroy_component(label, detaching);
  		}
  	};
  }

  // (46:6) <Icon class="material-icons">
  function create_default_slot_3$3(ctx) {
  	let t_value = /*tab*/ ctx[5].icon + "";
  	let t;

  	return {
  		c() {
  			t = text(t_value);
  		},
  		m(target, anchor) {
  			insert(target, t, anchor);
  		},
  		p(ctx, dirty) {
  			if (dirty & /*tab*/ 32 && t_value !== (t_value = /*tab*/ ctx[5].icon + "")) set_data(t, t_value);
  		},
  		d(detaching) {
  			if (detaching) detach(t);
  		}
  	};
  }

  // (47:6) <Label>
  function create_default_slot_2$5(ctx) {
  	let t_value = /*tab*/ ctx[5].label + "";
  	let t;

  	return {
  		c() {
  			t = text(t_value);
  		},
  		m(target, anchor) {
  			insert(target, t, anchor);
  		},
  		p(ctx, dirty) {
  			if (dirty & /*tab*/ 32 && t_value !== (t_value = /*tab*/ ctx[5].label + "")) set_data(t, t_value);
  		},
  		d(detaching) {
  			if (detaching) detach(t);
  		}
  	};
  }

  // (41:4) <Tab       {tab}       stacked={true}       indicatorSpanOnlyContent={true}       tabIndicator$transition="fade">
  function create_default_slot_1$6(ctx) {
  	let t;
  	let current;

  	const icon = new Icon({
  			props: {
  				class: "material-icons",
  				$$slots: { default: [create_default_slot_3$3] },
  				$$scope: { ctx }
  			}
  		});

  	const label = new Label({
  			props: {
  				$$slots: { default: [create_default_slot_2$5] },
  				$$scope: { ctx }
  			}
  		});

  	return {
  		c() {
  			create_component(icon.$$.fragment);
  			t = space();
  			create_component(label.$$.fragment);
  		},
  		m(target, anchor) {
  			mount_component(icon, target, anchor);
  			insert(target, t, anchor);
  			mount_component(label, target, anchor);
  			current = true;
  		},
  		p(ctx, dirty) {
  			const icon_changes = {};

  			if (dirty & /*$$scope, tab*/ 96) {
  				icon_changes.$$scope = { dirty, ctx };
  			}

  			icon.$set(icon_changes);
  			const label_changes = {};

  			if (dirty & /*$$scope, tab*/ 96) {
  				label_changes.$$scope = { dirty, ctx };
  			}

  			label.$set(label_changes);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(icon.$$.fragment, local);
  			transition_in(label.$$.fragment, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(icon.$$.fragment, local);
  			transition_out(label.$$.fragment, local);
  			current = false;
  		},
  		d(detaching) {
  			destroy_component(icon, detaching);
  			if (detaching) detach(t);
  			destroy_component(label, detaching);
  		}
  	};
  }

  // (36:2) <TabBar     tabs={keyedTabs}     let:tab     key={tab => tab.k}     bind:active={keyedTabsActive}>
  function create_default_slot$9(ctx) {
  	let current;

  	const tab = new Tab({
  			props: {
  				tab: /*tab*/ ctx[5],
  				stacked: true,
  				indicatorSpanOnlyContent: true,
  				tabIndicator$transition: "fade",
  				$$slots: { default: [create_default_slot_1$6] },
  				$$scope: { ctx }
  			}
  		});

  	return {
  		c() {
  			create_component(tab.$$.fragment);
  		},
  		m(target, anchor) {
  			mount_component(tab, target, anchor);
  			current = true;
  		},
  		p(ctx, dirty) {
  			const tab_changes = {};
  			if (dirty & /*tab*/ 32) tab_changes.tab = /*tab*/ ctx[5];

  			if (dirty & /*$$scope, tab*/ 96) {
  				tab_changes.$$scope = { dirty, ctx };
  			}

  			tab.$set(tab_changes);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(tab.$$.fragment, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(tab.$$.fragment, local);
  			current = false;
  		},
  		d(detaching) {
  			destroy_component(tab, detaching);
  		}
  	};
  }

  function create_fragment$x(ctx) {
  	let div1;
  	let h2;
  	let t1;
  	let p;
  	let t2;
  	let t3;
  	let t4;
  	let updating_active;
  	let t5;
  	let div0;
  	let current;

  	const button0 = new Button_1({
  			props: {
  				$$slots: { default: [create_default_slot_6] },
  				$$scope: { ctx }
  			}
  		});

  	button0.$on("click", /*click_handler*/ ctx[2]);

  	const button1 = new Button_1({
  			props: {
  				$$slots: { default: [create_default_slot_4$2] },
  				$$scope: { ctx }
  			}
  		});

  	button1.$on("click", /*click_handler_1*/ ctx[3]);

  	function tabbar_active_binding(value) {
  		/*tabbar_active_binding*/ ctx[4].call(null, value);
  	}

  	let tabbar_props = {
  		tabs: /*keyedTabs*/ ctx[1],
  		key: func,
  		$$slots: {
  			default: [create_default_slot$9, ({ tab }) => ({ 5: tab }), ({ tab }) => tab ? 32 : 0]
  		},
  		$$scope: { ctx }
  	};

  	if (/*keyedTabsActive*/ ctx[0] !== void 0) {
  		tabbar_props.active = /*keyedTabsActive*/ ctx[0];
  	}

  	const tabbar = new TabBar({ props: tabbar_props });
  	binding_callbacks.push(() => bind(tabbar, "active", tabbar_active_binding));
  	var switch_value = /*keyedTabsActive*/ ctx[0].component;

  	function switch_props(ctx) {
  		return {};
  	}

  	if (switch_value) {
  		var switch_instance = new switch_value(switch_props());
  	}

  	return {
  		c() {
  			div1 = element("div");
  			h2 = element("h2");
  			h2.textContent = "Questionnaires";
  			t1 = space();
  			p = element("p");
  			t2 = text("The questionnaires are mainly of two types, viz.\n    ");
  			create_component(button0.$$.fragment);
  			t3 = text("\n    or\n    ");
  			create_component(button1.$$.fragment);
  			t4 = space();
  			create_component(tabbar.$$.fragment);
  			t5 = space();
  			div0 = element("div");
  			if (switch_instance) create_component(switch_instance.$$.fragment);
  			attr(div0, "class", "container");
  			attr(div1, "class", "container");
  		},
  		m(target, anchor) {
  			insert(target, div1, anchor);
  			append(div1, h2);
  			append(div1, t1);
  			append(div1, p);
  			append(p, t2);
  			mount_component(button0, p, null);
  			append(p, t3);
  			mount_component(button1, p, null);
  			append(div1, t4);
  			mount_component(tabbar, div1, null);
  			append(div1, t5);
  			append(div1, div0);

  			if (switch_instance) {
  				mount_component(switch_instance, div0, null);
  			}

  			current = true;
  		},
  		p(ctx, [dirty]) {
  			const button0_changes = {};

  			if (dirty & /*$$scope*/ 64) {
  				button0_changes.$$scope = { dirty, ctx };
  			}

  			button0.$set(button0_changes);
  			const button1_changes = {};

  			if (dirty & /*$$scope*/ 64) {
  				button1_changes.$$scope = { dirty, ctx };
  			}

  			button1.$set(button1_changes);
  			const tabbar_changes = {};

  			if (dirty & /*$$scope, tab*/ 96) {
  				tabbar_changes.$$scope = { dirty, ctx };
  			}

  			if (!updating_active && dirty & /*keyedTabsActive*/ 1) {
  				updating_active = true;
  				tabbar_changes.active = /*keyedTabsActive*/ ctx[0];
  				add_flush_callback(() => updating_active = false);
  			}

  			tabbar.$set(tabbar_changes);

  			if (switch_value !== (switch_value = /*keyedTabsActive*/ ctx[0].component)) {
  				if (switch_instance) {
  					group_outros();
  					const old_component = switch_instance;

  					transition_out(old_component.$$.fragment, 1, 0, () => {
  						destroy_component(old_component, 1);
  					});

  					check_outros();
  				}

  				if (switch_value) {
  					switch_instance = new switch_value(switch_props());
  					create_component(switch_instance.$$.fragment);
  					transition_in(switch_instance.$$.fragment, 1);
  					mount_component(switch_instance, div0, null);
  				} else {
  					switch_instance = null;
  				}
  			}
  		},
  		i(local) {
  			if (current) return;
  			transition_in(button0.$$.fragment, local);
  			transition_in(button1.$$.fragment, local);
  			transition_in(tabbar.$$.fragment, local);
  			if (switch_instance) transition_in(switch_instance.$$.fragment, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(button0.$$.fragment, local);
  			transition_out(button1.$$.fragment, local);
  			transition_out(tabbar.$$.fragment, local);
  			if (switch_instance) transition_out(switch_instance.$$.fragment, local);
  			current = false;
  		},
  		d(detaching) {
  			if (detaching) detach(div1);
  			destroy_component(button0);
  			destroy_component(button1);
  			destroy_component(tabbar);
  			if (switch_instance) destroy_component(switch_instance);
  		}
  	};
  }

  const func = tab => tab.k;

  function instance$t($$self, $$props, $$invalidate) {
  	let keyedTabs = [
  			{
  				k: 1,
  				icon: "portrait",
  				label: "Intrapersonal",
  				component: Intra
  			},
  			{
  				k: 2,
  				icon: "transfer_within_a_station",
  				label: "Interpersonal",
  				component: Inter
  			}
  		],
  		keyedTabsActive = keyedTabs[0];

  	const click_handler = () => $$invalidate(0, keyedTabsActive = keyedTabs[0]);
  	const click_handler_1 = () => $$invalidate(0, keyedTabsActive = keyedTabs[1]);

  	function tabbar_active_binding(value) {
  		keyedTabsActive = value;
  		$$invalidate(0, keyedTabsActive);
  	}

  	return [
  		keyedTabsActive,
  		keyedTabs,
  		click_handler,
  		click_handler_1,
  		tabbar_active_binding
  	];
  }

  class Questions extends SvelteComponent {
  	constructor(options) {
  		super();
  		init(this, options, instance$t, create_fragment$x, safe_not_equal, {});
  	}
  }

  /* node_modules/@smui/chips/Chip.svelte generated by Svelte v3.18.1 */

  function create_fragment$y(ctx) {
  	let div;
  	let useActions_action;
  	let forwardEvents_action;
  	let current;
  	let dispose;
  	const default_slot_template = /*$$slots*/ ctx[13].default;
  	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[12], null);

  	let div_levels = [
  		{
  			class: "\n    mdc-chip\n    " + /*className*/ ctx[2] + "\n    " + (/*selected*/ ctx[0] ? "mdc-chip--selected" : "") + "\n  "
  		},
  		exclude(/*$$props*/ ctx[6], ["use", "class", "ripple", "selected", "shouldRemoveOnTrailingIconClick"])
  	];

  	let div_data = {};

  	for (let i = 0; i < div_levels.length; i += 1) {
  		div_data = assign(div_data, div_levels[i]);
  	}

  	return {
  		c() {
  			div = element("div");
  			if (default_slot) default_slot.c();
  			set_attributes(div, div_data);
  		},
  		m(target, anchor) {
  			insert(target, div, anchor);

  			if (default_slot) {
  				default_slot.m(div, null);
  			}

  			/*div_binding*/ ctx[14](div);
  			current = true;

  			dispose = [
  				action_destroyer(useActions_action = useActions.call(null, div, /*use*/ ctx[1])),
  				action_destroyer(forwardEvents_action = /*forwardEvents*/ ctx[4].call(null, div)),
  				listen(div, "MDCChip:selection", /*handleSelection*/ ctx[5])
  			];
  		},
  		p(ctx, [dirty]) {
  			if (default_slot && default_slot.p && dirty & /*$$scope*/ 4096) {
  				default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[12], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[12], dirty, null));
  			}

  			set_attributes(div, get_spread_update(div_levels, [
  				dirty & /*className, selected*/ 5 && {
  					class: "\n    mdc-chip\n    " + /*className*/ ctx[2] + "\n    " + (/*selected*/ ctx[0] ? "mdc-chip--selected" : "") + "\n  "
  				},
  				dirty & /*exclude, $$props*/ 64 && exclude(/*$$props*/ ctx[6], ["use", "class", "ripple", "selected", "shouldRemoveOnTrailingIconClick"])
  			]));

  			if (useActions_action && is_function(useActions_action.update) && dirty & /*use*/ 2) useActions_action.update.call(null, /*use*/ ctx[1]);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(default_slot, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(default_slot, local);
  			current = false;
  		},
  		d(detaching) {
  			if (detaching) detach(div);
  			if (default_slot) default_slot.d(detaching);
  			/*div_binding*/ ctx[14](null);
  			run_all(dispose);
  		}
  	};
  }

  function instance$u($$self, $$props, $$invalidate) {
  	const forwardEvents = forwardEventsBuilder(current_component, [
  		"MDCChip:interaction",
  		"MDCChip:selection",
  		"MDCChip:removal",
  		"MDCChip:trailingIconInteraction"
  	]);

  	let { use = [] } = $$props;
  	let { class: className = "" } = $$props;
  	let { ripple = true } = $$props;
  	let { selected = false } = $$props;
  	let { shouldRemoveOnTrailingIconClick = true } = $$props;
  	setContext("SMUI:label:context", "chip");
  	setContext("SMUI:icon:context", "chip");
  	let element;
  	let chip;
  	let previousSelected = selected;

  	onMount(() => {
  		$$invalidate(3, element.setChip = setChip, element);
  	});

  	function setChip(component) {
  		$$invalidate(9, chip = component);

  		if (!ripple) {
  			chip.ripple && chip.ripple.destroy();
  		}
  	}

  	function handleSelection(e) {
  		$$invalidate(0, selected = e.detail.selected);
  	}

  	let { $$slots = {}, $$scope } = $$props;

  	function div_binding($$value) {
  		binding_callbacks[$$value ? "unshift" : "push"](() => {
  			$$invalidate(3, element = $$value);
  		});
  	}

  	$$self.$set = $$new_props => {
  		$$invalidate(6, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
  		if ("use" in $$new_props) $$invalidate(1, use = $$new_props.use);
  		if ("class" in $$new_props) $$invalidate(2, className = $$new_props.class);
  		if ("ripple" in $$new_props) $$invalidate(7, ripple = $$new_props.ripple);
  		if ("selected" in $$new_props) $$invalidate(0, selected = $$new_props.selected);
  		if ("shouldRemoveOnTrailingIconClick" in $$new_props) $$invalidate(8, shouldRemoveOnTrailingIconClick = $$new_props.shouldRemoveOnTrailingIconClick);
  		if ("$$scope" in $$new_props) $$invalidate(12, $$scope = $$new_props.$$scope);
  	};

  	$$self.$$.update = () => {
  		if ($$self.$$.dirty & /*chip, previousSelected, selected*/ 1537) {
  			 if (chip && previousSelected !== selected) {
  				if (selected !== chip.selected) {
  					$$invalidate(9, chip.selected = selected, chip);
  				}

  				$$invalidate(10, previousSelected = selected);
  			}
  		}

  		if ($$self.$$.dirty & /*chip, shouldRemoveOnTrailingIconClick*/ 768) {
  			 if (chip && chip.shouldRemoveOnTrailingIconClick !== shouldRemoveOnTrailingIconClick) {
  				$$invalidate(9, chip.shouldRemoveOnTrailingIconClick = shouldRemoveOnTrailingIconClick, chip);
  			}
  		}
  	};

  	$$props = exclude_internal_props($$props);

  	return [
  		selected,
  		use,
  		className,
  		element,
  		forwardEvents,
  		handleSelection,
  		$$props,
  		ripple,
  		shouldRemoveOnTrailingIconClick,
  		chip,
  		previousSelected,
  		setChip,
  		$$scope,
  		$$slots,
  		div_binding
  	];
  }

  class Chip extends SvelteComponent {
  	constructor(options) {
  		super();

  		init(this, options, instance$u, create_fragment$y, safe_not_equal, {
  			use: 1,
  			class: 2,
  			ripple: 7,
  			selected: 0,
  			shouldRemoveOnTrailingIconClick: 8
  		});
  	}
  }

  /* node_modules/@smui/card/Card.svelte generated by Svelte v3.18.1 */

  function create_fragment$z(ctx) {
  	let div;
  	let useActions_action;
  	let forwardEvents_action;
  	let current;
  	let dispose;
  	const default_slot_template = /*$$slots*/ ctx[7].default;
  	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[6], null);

  	let div_levels = [
  		{
  			class: "\n    mdc-card\n    " + /*className*/ ctx[1] + "\n    " + (/*variant*/ ctx[2] === "outlined"
  			? "mdc-card--outlined"
  			: "") + "\n    " + (/*padded*/ ctx[3] ? "smui-card--padded" : "") + "\n  "
  		},
  		exclude(/*$$props*/ ctx[5], ["use", "class", "variant", "padded"])
  	];

  	let div_data = {};

  	for (let i = 0; i < div_levels.length; i += 1) {
  		div_data = assign(div_data, div_levels[i]);
  	}

  	return {
  		c() {
  			div = element("div");
  			if (default_slot) default_slot.c();
  			set_attributes(div, div_data);
  		},
  		m(target, anchor) {
  			insert(target, div, anchor);

  			if (default_slot) {
  				default_slot.m(div, null);
  			}

  			current = true;

  			dispose = [
  				action_destroyer(useActions_action = useActions.call(null, div, /*use*/ ctx[0])),
  				action_destroyer(forwardEvents_action = /*forwardEvents*/ ctx[4].call(null, div))
  			];
  		},
  		p(ctx, [dirty]) {
  			if (default_slot && default_slot.p && dirty & /*$$scope*/ 64) {
  				default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[6], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[6], dirty, null));
  			}

  			set_attributes(div, get_spread_update(div_levels, [
  				dirty & /*className, variant, padded*/ 14 && {
  					class: "\n    mdc-card\n    " + /*className*/ ctx[1] + "\n    " + (/*variant*/ ctx[2] === "outlined"
  					? "mdc-card--outlined"
  					: "") + "\n    " + (/*padded*/ ctx[3] ? "smui-card--padded" : "") + "\n  "
  				},
  				dirty & /*exclude, $$props*/ 32 && exclude(/*$$props*/ ctx[5], ["use", "class", "variant", "padded"])
  			]));

  			if (useActions_action && is_function(useActions_action.update) && dirty & /*use*/ 1) useActions_action.update.call(null, /*use*/ ctx[0]);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(default_slot, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(default_slot, local);
  			current = false;
  		},
  		d(detaching) {
  			if (detaching) detach(div);
  			if (default_slot) default_slot.d(detaching);
  			run_all(dispose);
  		}
  	};
  }

  function instance$v($$self, $$props, $$invalidate) {
  	const forwardEvents = forwardEventsBuilder(current_component);
  	let { use = [] } = $$props;
  	let { class: className = "" } = $$props;
  	let { variant = "raised" } = $$props;
  	let { padded = false } = $$props;
  	let { $$slots = {}, $$scope } = $$props;

  	$$self.$set = $$new_props => {
  		$$invalidate(5, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
  		if ("use" in $$new_props) $$invalidate(0, use = $$new_props.use);
  		if ("class" in $$new_props) $$invalidate(1, className = $$new_props.class);
  		if ("variant" in $$new_props) $$invalidate(2, variant = $$new_props.variant);
  		if ("padded" in $$new_props) $$invalidate(3, padded = $$new_props.padded);
  		if ("$$scope" in $$new_props) $$invalidate(6, $$scope = $$new_props.$$scope);
  	};

  	$$props = exclude_internal_props($$props);
  	return [use, className, variant, padded, forwardEvents, $$props, $$scope, $$slots];
  }

  class Card extends SvelteComponent {
  	constructor(options) {
  		super();
  		init(this, options, instance$v, create_fragment$z, safe_not_equal, { use: 0, class: 1, variant: 2, padded: 3 });
  	}
  }

  var Content$2 = classAdderBuilder({
    class: 'smui-card__content',
    component: Div,
    contexts: {}
  });

  classAdderBuilder({
    class: 'mdc-card__media-content',
    component: Div,
    contexts: {}
  });

  /* node_modules/@smui/card/Actions.svelte generated by Svelte v3.18.1 */

  function create_fragment$A(ctx) {
  	let div;
  	let useActions_action;
  	let forwardEvents_action;
  	let current;
  	let dispose;
  	const default_slot_template = /*$$slots*/ ctx[6].default;
  	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[5], null);

  	let div_levels = [
  		{
  			class: "\n    mdc-card__actions\n    " + /*className*/ ctx[1] + "\n    " + (/*fullBleed*/ ctx[2]
  			? "mdc-card__actions--full-bleed"
  			: "") + "\n  "
  		},
  		exclude(/*$$props*/ ctx[4], ["use", "class", "fullBleed"])
  	];

  	let div_data = {};

  	for (let i = 0; i < div_levels.length; i += 1) {
  		div_data = assign(div_data, div_levels[i]);
  	}

  	return {
  		c() {
  			div = element("div");
  			if (default_slot) default_slot.c();
  			set_attributes(div, div_data);
  		},
  		m(target, anchor) {
  			insert(target, div, anchor);

  			if (default_slot) {
  				default_slot.m(div, null);
  			}

  			current = true;

  			dispose = [
  				action_destroyer(useActions_action = useActions.call(null, div, /*use*/ ctx[0])),
  				action_destroyer(forwardEvents_action = /*forwardEvents*/ ctx[3].call(null, div))
  			];
  		},
  		p(ctx, [dirty]) {
  			if (default_slot && default_slot.p && dirty & /*$$scope*/ 32) {
  				default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[5], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[5], dirty, null));
  			}

  			set_attributes(div, get_spread_update(div_levels, [
  				dirty & /*className, fullBleed*/ 6 && {
  					class: "\n    mdc-card__actions\n    " + /*className*/ ctx[1] + "\n    " + (/*fullBleed*/ ctx[2]
  					? "mdc-card__actions--full-bleed"
  					: "") + "\n  "
  				},
  				dirty & /*exclude, $$props*/ 16 && exclude(/*$$props*/ ctx[4], ["use", "class", "fullBleed"])
  			]));

  			if (useActions_action && is_function(useActions_action.update) && dirty & /*use*/ 1) useActions_action.update.call(null, /*use*/ ctx[0]);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(default_slot, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(default_slot, local);
  			current = false;
  		},
  		d(detaching) {
  			if (detaching) detach(div);
  			if (default_slot) default_slot.d(detaching);
  			run_all(dispose);
  		}
  	};
  }

  function instance$w($$self, $$props, $$invalidate) {
  	const forwardEvents = forwardEventsBuilder(current_component);
  	let { use = [] } = $$props;
  	let { class: className = "" } = $$props;
  	let { fullBleed = false } = $$props;
  	setContext("SMUI:button:context", "card:action");
  	setContext("SMUI:icon-button:context", "card:action");
  	let { $$slots = {}, $$scope } = $$props;

  	$$self.$set = $$new_props => {
  		$$invalidate(4, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
  		if ("use" in $$new_props) $$invalidate(0, use = $$new_props.use);
  		if ("class" in $$new_props) $$invalidate(1, className = $$new_props.class);
  		if ("fullBleed" in $$new_props) $$invalidate(2, fullBleed = $$new_props.fullBleed);
  		if ("$$scope" in $$new_props) $$invalidate(5, $$scope = $$new_props.$$scope);
  	};

  	$$props = exclude_internal_props($$props);
  	return [use, className, fullBleed, forwardEvents, $$props, $$scope, $$slots];
  }

  class Actions extends SvelteComponent {
  	constructor(options) {
  		super();
  		init(this, options, instance$w, create_fragment$A, safe_not_equal, { use: 0, class: 1, fullBleed: 2 });
  	}
  }

  classAdderBuilder({
    class: 'mdc-card__action-buttons',
    component: Div,
    contexts: {}
  });

  classAdderBuilder({
    class: 'mdc-card__action-icons',
    component: Div,
    contexts: {}
  });

  /* src/routes/Questionnaire.svelte generated by Svelte v3.18.1 */

  const { document: document_1 } = globals;

  function create_default_slot_6$1(ctx) {
  	let t;

  	return {
  		c() {
  			t = text(/*icon*/ ctx[3]);
  		},
  		m(target, anchor) {
  			insert(target, t, anchor);
  		},
  		p(ctx, dirty) {
  			if (dirty & /*icon*/ 8) set_data(t, /*icon*/ ctx[3]);
  		},
  		d(detaching) {
  			if (detaching) detach(t);
  		}
  	};
  }

  // (56:8) <Chip>
  function create_default_slot_5$3(ctx) {
  	let t0;
  	let t1;
  	let current;

  	const icon_1 = new Icon({
  			props: {
  				class: "material-icons",
  				leading: true,
  				$$slots: { default: [create_default_slot_6$1] },
  				$$scope: { ctx }
  			}
  		});

  	return {
  		c() {
  			create_component(icon_1.$$.fragment);
  			t0 = space();
  			t1 = text(/*__type*/ ctx[1]);
  		},
  		m(target, anchor) {
  			mount_component(icon_1, target, anchor);
  			insert(target, t0, anchor);
  			insert(target, t1, anchor);
  			current = true;
  		},
  		p(ctx, dirty) {
  			const icon_1_changes = {};

  			if (dirty & /*$$scope, icon*/ 72) {
  				icon_1_changes.$$scope = { dirty, ctx };
  			}

  			icon_1.$set(icon_1_changes);
  			if (!current || dirty & /*__type*/ 2) set_data(t1, /*__type*/ ctx[1]);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(icon_1.$$.fragment, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(icon_1.$$.fragment, local);
  			current = false;
  		},
  		d(detaching) {
  			destroy_component(icon_1, detaching);
  			if (detaching) detach(t0);
  			if (detaching) detach(t1);
  		}
  	};
  }

  // (53:4) <Content>
  function create_default_slot_4$3(ctx) {
  	let h2;
  	let t0;
  	let t1;
  	let t2;
  	let html_tag;
  	let current;

  	const chip = new Chip({
  			props: {
  				$$slots: { default: [create_default_slot_5$3] },
  				$$scope: { ctx }
  			}
  		});

  	return {
  		c() {
  			h2 = element("h2");
  			t0 = text(/*__id*/ ctx[2]);
  			t1 = space();
  			create_component(chip.$$.fragment);
  			t2 = space();
  			attr(h2, "class", "mdc-typography--headline2");
  			html_tag = new HtmlTag(/*content*/ ctx[4], null);
  		},
  		m(target, anchor) {
  			insert(target, h2, anchor);
  			append(h2, t0);
  			append(h2, t1);
  			mount_component(chip, h2, null);
  			insert(target, t2, anchor);
  			html_tag.m(target, anchor);
  			current = true;
  		},
  		p(ctx, dirty) {
  			if (!current || dirty & /*__id*/ 4) set_data(t0, /*__id*/ ctx[2]);
  			const chip_changes = {};

  			if (dirty & /*$$scope, __type, icon*/ 74) {
  				chip_changes.$$scope = { dirty, ctx };
  			}

  			chip.$set(chip_changes);
  			if (!current || dirty & /*content*/ 16) html_tag.p(/*content*/ ctx[4]);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(chip.$$.fragment, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(chip.$$.fragment, local);
  			current = false;
  		},
  		d(detaching) {
  			if (detaching) detach(h2);
  			destroy_component(chip);
  			if (detaching) detach(t2);
  			if (detaching) html_tag.d();
  		}
  	};
  }

  // (65:8) <Label>
  function create_default_slot_3$4(ctx) {
  	let t;

  	return {
  		c() {
  			t = text("Attempt Questionnaire!");
  		},
  		m(target, anchor) {
  			insert(target, t, anchor);
  		},
  		d(detaching) {
  			if (detaching) detach(t);
  		}
  	};
  }

  // (64:6) <Button on:click={() => push(`/questions/${__type}/${__id}/attempt`)}>
  function create_default_slot_2$6(ctx) {
  	let t0;
  	let i;
  	let current;

  	const label = new Label({
  			props: {
  				$$slots: { default: [create_default_slot_3$4] },
  				$$scope: { ctx }
  			}
  		});

  	return {
  		c() {
  			create_component(label.$$.fragment);
  			t0 = space();
  			i = element("i");
  			i.textContent = "arrow_forward";
  			attr(i, "class", "material-icons");
  			attr(i, "aria-hidden", "true");
  		},
  		m(target, anchor) {
  			mount_component(label, target, anchor);
  			insert(target, t0, anchor);
  			insert(target, i, anchor);
  			current = true;
  		},
  		p(ctx, dirty) {
  			const label_changes = {};

  			if (dirty & /*$$scope*/ 64) {
  				label_changes.$$scope = { dirty, ctx };
  			}

  			label.$set(label_changes);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(label.$$.fragment, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(label.$$.fragment, local);
  			current = false;
  		},
  		d(detaching) {
  			destroy_component(label, detaching);
  			if (detaching) detach(t0);
  			if (detaching) detach(i);
  		}
  	};
  }

  // (63:4) <Actions fullBleed>
  function create_default_slot_1$7(ctx) {
  	let current;

  	const button = new Button_1({
  			props: {
  				$$slots: { default: [create_default_slot_2$6] },
  				$$scope: { ctx }
  			}
  		});

  	button.$on("click", /*click_handler*/ ctx[5]);

  	return {
  		c() {
  			create_component(button.$$.fragment);
  		},
  		m(target, anchor) {
  			mount_component(button, target, anchor);
  			current = true;
  		},
  		p(ctx, dirty) {
  			const button_changes = {};

  			if (dirty & /*$$scope*/ 64) {
  				button_changes.$$scope = { dirty, ctx };
  			}

  			button.$set(button_changes);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(button.$$.fragment, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(button.$$.fragment, local);
  			current = false;
  		},
  		d(detaching) {
  			destroy_component(button, detaching);
  		}
  	};
  }

  // (52:2) <Card elevation={10}>
  function create_default_slot$a(ctx) {
  	let t;
  	let current;

  	const content_1 = new Content$2({
  			props: {
  				$$slots: { default: [create_default_slot_4$3] },
  				$$scope: { ctx }
  			}
  		});

  	const actions = new Actions({
  			props: {
  				fullBleed: true,
  				$$slots: { default: [create_default_slot_1$7] },
  				$$scope: { ctx }
  			}
  		});

  	return {
  		c() {
  			create_component(content_1.$$.fragment);
  			t = space();
  			create_component(actions.$$.fragment);
  		},
  		m(target, anchor) {
  			mount_component(content_1, target, anchor);
  			insert(target, t, anchor);
  			mount_component(actions, target, anchor);
  			current = true;
  		},
  		p(ctx, dirty) {
  			const content_1_changes = {};

  			if (dirty & /*$$scope, content, __type, icon, __id*/ 94) {
  				content_1_changes.$$scope = { dirty, ctx };
  			}

  			content_1.$set(content_1_changes);
  			const actions_changes = {};

  			if (dirty & /*$$scope, __type, __id*/ 70) {
  				actions_changes.$$scope = { dirty, ctx };
  			}

  			actions.$set(actions_changes);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(content_1.$$.fragment, local);
  			transition_in(actions.$$.fragment, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(content_1.$$.fragment, local);
  			transition_out(actions.$$.fragment, local);
  			current = false;
  		},
  		d(detaching) {
  			destroy_component(content_1, detaching);
  			if (detaching) detach(t);
  			destroy_component(actions, detaching);
  		}
  	};
  }

  function create_fragment$B(ctx) {
  	let title_value;
  	let t;
  	let div;
  	let current;
  	document_1.title = title_value = "" + (/*params*/ ctx[0].type + "personal - " + /*params*/ ctx[0].name);

  	const card = new Card({
  			props: {
  				elevation: 10,
  				$$slots: { default: [create_default_slot$a] },
  				$$scope: { ctx }
  			}
  		});

  	return {
  		c() {
  			t = space();
  			div = element("div");
  			create_component(card.$$.fragment);
  			attr(div, "class", "card-container");
  		},
  		m(target, anchor) {
  			insert(target, t, anchor);
  			insert(target, div, anchor);
  			mount_component(card, div, null);
  			current = true;
  		},
  		p(ctx, [dirty]) {
  			if ((!current || dirty & /*params*/ 1) && title_value !== (title_value = "" + (/*params*/ ctx[0].type + "personal - " + /*params*/ ctx[0].name))) {
  				document_1.title = title_value;
  			}

  			const card_changes = {};

  			if (dirty & /*$$scope, __type, __id, content, icon*/ 94) {
  				card_changes.$$scope = { dirty, ctx };
  			}

  			card.$set(card_changes);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(card.$$.fragment, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(card.$$.fragment, local);
  			current = false;
  		},
  		d(detaching) {
  			if (detaching) detach(t);
  			if (detaching) detach(div);
  			destroy_component(card);
  		}
  	};
  }

  const md = window.markdownit();

  let icons = {
  	intra: "portrait",
  	inter: "transfer_within_a_station"
  };

  let __content;

  function instance$x($$self, $$props, $$invalidate) {
  	let { params = {} } = $$props;
  	let __type, __id, icon, content;

  	onMount(async () => {
  		await fetch(`https://api.github.com/gists/d1c4dc0a76d3c844ff00cb57d9bc5b33`).then(results => {
  			return results.json();
  		}).then(data => {
  			__content = data.files;
  			$$invalidate(4, content = md.render(__content[`${__id}.md`].content));
  		}).catch(err => console.log(err));
  	});

  	afterUpdate(() => {
  		console.log(params);
  		if (__content) $$invalidate(4, content = md.render(__content[`${__id}.md`].content));
  	});

  	const click_handler = () => push(`/questions/${__type}/${__id}/attempt`);

  	$$self.$set = $$props => {
  		if ("params" in $$props) $$invalidate(0, params = $$props.params);
  	};

  	$$self.$$.update = () => {
  		if ($$self.$$.dirty & /*params*/ 1) {
  			 document.title = `${params.type}personal - ${params.name}`;
  		}

  		if ($$self.$$.dirty & /*params, __type*/ 3) {
  			 ($$invalidate(1, __type = params.type), $$invalidate(2, __id = params.name), $$invalidate(3, icon = icons[__type]));
  		}
  	};

  	return [params, __type, __id, icon, content, click_handler];
  }

  class Questionnaire extends SvelteComponent {
  	constructor(options) {
  		super();
  		init(this, options, instance$x, create_fragment$B, safe_not_equal, { params: 0 });
  	}
  }

  /* src/routes/NotFound.svelte generated by Svelte v3.18.1 */

  function create_fragment$C(ctx) {
  	let h1;
  	let t1;
  	let p;
  	let t2;
  	let em;
  	let t4;
  	let a0;
  	let t6;
  	let a1;
  	let link_action;
  	let t8;
  	let dispose;

  	return {
  		c() {
  			h1 = element("h1");
  			h1.textContent = "Not Found (404)!";
  			t1 = space();
  			p = element("p");
  			t2 = text("Oops, this route doesn't exist or\n  ");
  			em = element("em");
  			em.textContent = "may";
  			t4 = text("\n  have been removed for updates!\n  ");
  			a0 = element("a");
  			a0.textContent = "Refresh";
  			t6 = text("\n  this page or go back\n  ");
  			a1 = element("a");
  			a1.textContent = "home";
  			t8 = text("\n  .");
  			attr(h1, "class", "routetitle");
  			attr(a0, "href", "javascript:void(0)");
  			attr(a1, "href", "/");
  		},
  		m(target, anchor) {
  			insert(target, h1, anchor);
  			insert(target, t1, anchor);
  			insert(target, p, anchor);
  			append(p, t2);
  			append(p, em);
  			append(p, t4);
  			append(p, a0);
  			append(p, t6);
  			append(p, a1);
  			append(p, t8);

  			dispose = [
  				listen(a0, "click", /*click_handler*/ ctx[0]),
  				action_destroyer(link_action = link.call(null, a1))
  			];
  		},
  		p: noop,
  		i: noop,
  		o: noop,
  		d(detaching) {
  			if (detaching) detach(h1);
  			if (detaching) detach(t1);
  			if (detaching) detach(p);
  			run_all(dispose);
  		}
  	};
  }

  function instance$y($$self) {
  	const click_handler = () => window.location.reload();
  	return [click_handler];
  }

  class NotFound extends SvelteComponent {
  	constructor(options) {
  		super();
  		init(this, options, instance$y, create_fragment$C, safe_not_equal, {});
  	}
  }

  // Import the "wrap" function

  // This demonstrates how to pass routes as a POJO (Plain Old JavaScript Object) or a JS Map
  let routes = new Map();

  // Exact path
  routes.set('/', Home);
  routes.set('/renumeration', Renumeration);
  routes.set('/privacy', Privacy);
  routes.set('/questions', Questions);
  routes.set('/questions/:type/:name', Questionnaire);

  // Regular expressions
  routes.set(/^\/regex\/(.*)?/i, Regex);
  routes.set(/^\/(pattern|match)(\/[a-z0-9]+)?/i, Regex);

  // Catch-all, must be last
  routes.set('*', NotFound);

  /* src/App.svelte generated by Svelte v3.18.1 */

  function create_default_slot_52(ctx) {
  	let t;

  	return {
  		c() {
  			t = text("apps");
  		},
  		m(target, anchor) {
  			insert(target, t, anchor);
  		},
  		d(detaching) {
  			if (detaching) detach(t);
  		}
  	};
  }

  // (49:4) <Section>
  function create_default_slot_51(ctx) {
  	let current;

  	const iconbutton = new IconButton({
  			props: {
  				class: "material-icons",
  				$$slots: { default: [create_default_slot_52] },
  				$$scope: { ctx }
  			}
  		});

  	iconbutton.$on("click", /*click_handler*/ ctx[3]);

  	return {
  		c() {
  			create_component(iconbutton.$$.fragment);
  		},
  		m(target, anchor) {
  			mount_component(iconbutton, target, anchor);
  			current = true;
  		},
  		p(ctx, dirty) {
  			const iconbutton_changes = {};

  			if (dirty & /*$$scope*/ 2097152) {
  				iconbutton_changes.$$scope = { dirty, ctx };
  			}

  			iconbutton.$set(iconbutton_changes);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(iconbutton.$$.fragment, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(iconbutton.$$.fragment, local);
  			current = false;
  		},
  		d(detaching) {
  			destroy_component(iconbutton, detaching);
  		}
  	};
  }

  // (57:6) <Title component={A} on:click={() => replace('/')} class="">
  function create_default_slot_50(ctx) {
  	let t;

  	return {
  		c() {
  			t = text("Social Network App");
  		},
  		m(target, anchor) {
  			insert(target, t, anchor);
  		},
  		d(detaching) {
  			if (detaching) detach(t);
  		}
  	};
  }

  // (56:4) <Section align="center">
  function create_default_slot_49(ctx) {
  	let current;

  	const title_1 = new Title({
  			props: {
  				component: A,
  				class: "",
  				$$slots: { default: [create_default_slot_50] },
  				$$scope: { ctx }
  			}
  		});

  	title_1.$on("click", /*click_handler_1*/ ctx[4]);

  	return {
  		c() {
  			create_component(title_1.$$.fragment);
  		},
  		m(target, anchor) {
  			mount_component(title_1, target, anchor);
  			current = true;
  		},
  		p(ctx, dirty) {
  			const title_1_changes = {};

  			if (dirty & /*$$scope*/ 2097152) {
  				title_1_changes.$$scope = { dirty, ctx };
  			}

  			title_1.$set(title_1_changes);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(title_1.$$.fragment, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(title_1.$$.fragment, local);
  			current = false;
  		},
  		d(detaching) {
  			destroy_component(title_1, detaching);
  		}
  	};
  }

  // (62:6) <IconButton class="material-icons" on:click={() => replace('/api/login')}>
  function create_default_slot_48(ctx) {
  	let t;

  	return {
  		c() {
  			t = text("fingerprint");
  		},
  		m(target, anchor) {
  			insert(target, t, anchor);
  		},
  		d(detaching) {
  			if (detaching) detach(t);
  		}
  	};
  }

  // (61:4) <Section align="end" toolbar>
  function create_default_slot_47(ctx) {
  	let current;

  	const iconbutton = new IconButton({
  			props: {
  				class: "material-icons",
  				$$slots: { default: [create_default_slot_48] },
  				$$scope: { ctx }
  			}
  		});

  	iconbutton.$on("click", /*click_handler_2*/ ctx[5]);

  	return {
  		c() {
  			create_component(iconbutton.$$.fragment);
  		},
  		m(target, anchor) {
  			mount_component(iconbutton, target, anchor);
  			current = true;
  		},
  		p(ctx, dirty) {
  			const iconbutton_changes = {};

  			if (dirty & /*$$scope*/ 2097152) {
  				iconbutton_changes.$$scope = { dirty, ctx };
  			}

  			iconbutton.$set(iconbutton_changes);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(iconbutton.$$.fragment, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(iconbutton.$$.fragment, local);
  			current = false;
  		},
  		d(detaching) {
  			destroy_component(iconbutton, detaching);
  		}
  	};
  }

  // (48:2) <Row>
  function create_default_slot_46(ctx) {
  	let t0;
  	let t1;
  	let current;

  	const section0 = new Section({
  			props: {
  				$$slots: { default: [create_default_slot_51] },
  				$$scope: { ctx }
  			}
  		});

  	const section1 = new Section({
  			props: {
  				align: "center",
  				$$slots: { default: [create_default_slot_49] },
  				$$scope: { ctx }
  			}
  		});

  	const section2 = new Section({
  			props: {
  				align: "end",
  				toolbar: true,
  				$$slots: { default: [create_default_slot_47] },
  				$$scope: { ctx }
  			}
  		});

  	return {
  		c() {
  			create_component(section0.$$.fragment);
  			t0 = space();
  			create_component(section1.$$.fragment);
  			t1 = space();
  			create_component(section2.$$.fragment);
  		},
  		m(target, anchor) {
  			mount_component(section0, target, anchor);
  			insert(target, t0, anchor);
  			mount_component(section1, target, anchor);
  			insert(target, t1, anchor);
  			mount_component(section2, target, anchor);
  			current = true;
  		},
  		p(ctx, dirty) {
  			const section0_changes = {};

  			if (dirty & /*$$scope, drawerOpen*/ 2097154) {
  				section0_changes.$$scope = { dirty, ctx };
  			}

  			section0.$set(section0_changes);
  			const section1_changes = {};

  			if (dirty & /*$$scope*/ 2097152) {
  				section1_changes.$$scope = { dirty, ctx };
  			}

  			section1.$set(section1_changes);
  			const section2_changes = {};

  			if (dirty & /*$$scope*/ 2097152) {
  				section2_changes.$$scope = { dirty, ctx };
  			}

  			section2.$set(section2_changes);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(section0.$$.fragment, local);
  			transition_in(section1.$$.fragment, local);
  			transition_in(section2.$$.fragment, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(section0.$$.fragment, local);
  			transition_out(section1.$$.fragment, local);
  			transition_out(section2.$$.fragment, local);
  			current = false;
  		},
  		d(detaching) {
  			destroy_component(section0, detaching);
  			if (detaching) detach(t0);
  			destroy_component(section1, detaching);
  			if (detaching) detach(t1);
  			destroy_component(section2, detaching);
  		}
  	};
  }

  // (47:0) <TopAppBar variant="static" style="background-color: black;">
  function create_default_slot_45(ctx) {
  	let current;

  	const row = new Row({
  			props: {
  				$$slots: { default: [create_default_slot_46] },
  				$$scope: { ctx }
  			}
  		});

  	return {
  		c() {
  			create_component(row.$$.fragment);
  		},
  		m(target, anchor) {
  			mount_component(row, target, anchor);
  			current = true;
  		},
  		p(ctx, dirty) {
  			const row_changes = {};

  			if (dirty & /*$$scope, drawerOpen*/ 2097154) {
  				row_changes.$$scope = { dirty, ctx };
  			}

  			row.$set(row_changes);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(row.$$.fragment, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(row.$$.fragment, local);
  			current = false;
  		},
  		d(detaching) {
  			destroy_component(row, detaching);
  		}
  	};
  }

  // (73:6) <Title>
  function create_default_slot_44(ctx) {
  	let t;

  	return {
  		c() {
  			t = text("Information");
  		},
  		m(target, anchor) {
  			insert(target, t, anchor);
  		},
  		d(detaching) {
  			if (detaching) detach(t);
  		}
  	};
  }

  // (74:6) <Subtitle>
  function create_default_slot_43(ctx) {
  	let t;

  	return {
  		c() {
  			t = text("Research Overview");
  		},
  		m(target, anchor) {
  			insert(target, t, anchor);
  		},
  		d(detaching) {
  			if (detaching) detach(t);
  		}
  	};
  }

  // (72:4) <Header>
  function create_default_slot_42(ctx) {
  	let t;
  	let current;

  	const title_1 = new Title({
  			props: {
  				$$slots: { default: [create_default_slot_44] },
  				$$scope: { ctx }
  			}
  		});

  	const subtitle = new Subtitle({
  			props: {
  				$$slots: { default: [create_default_slot_43] },
  				$$scope: { ctx }
  			}
  		});

  	return {
  		c() {
  			create_component(title_1.$$.fragment);
  			t = space();
  			create_component(subtitle.$$.fragment);
  		},
  		m(target, anchor) {
  			mount_component(title_1, target, anchor);
  			insert(target, t, anchor);
  			mount_component(subtitle, target, anchor);
  			current = true;
  		},
  		p(ctx, dirty) {
  			const title_1_changes = {};

  			if (dirty & /*$$scope*/ 2097152) {
  				title_1_changes.$$scope = { dirty, ctx };
  			}

  			title_1.$set(title_1_changes);
  			const subtitle_changes = {};

  			if (dirty & /*$$scope*/ 2097152) {
  				subtitle_changes.$$scope = { dirty, ctx };
  			}

  			subtitle.$set(subtitle_changes);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(title_1.$$.fragment, local);
  			transition_in(subtitle.$$.fragment, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(title_1.$$.fragment, local);
  			transition_out(subtitle.$$.fragment, local);
  			current = false;
  		},
  		d(detaching) {
  			destroy_component(title_1, detaching);
  			if (detaching) detach(t);
  			destroy_component(subtitle, detaching);
  		}
  	};
  }

  // (78:8) <Graphic class="material-icons" aria-hidden="true">
  function create_default_slot_41(ctx) {
  	let t;

  	return {
  		c() {
  			t = text("link");
  		},
  		m(target, anchor) {
  			insert(target, t, anchor);
  		},
  		d(detaching) {
  			if (detaching) detach(t);
  		}
  	};
  }

  // (79:8) <Text>
  function create_default_slot_40(ctx) {
  	let t;

  	return {
  		c() {
  			t = text("Introduction");
  		},
  		m(target, anchor) {
  			insert(target, t, anchor);
  		},
  		d(detaching) {
  			if (detaching) detach(t);
  		}
  	};
  }

  // (77:6) <Item href="javascript:void(0)" on:SMUI:action={() => switchPage('/')}>
  function create_default_slot_39(ctx) {
  	let t;
  	let current;

  	const graphic = new Graphic({
  			props: {
  				class: "material-icons",
  				"aria-hidden": "true",
  				$$slots: { default: [create_default_slot_41] },
  				$$scope: { ctx }
  			}
  		});

  	const text_1 = new Text({
  			props: {
  				$$slots: { default: [create_default_slot_40] },
  				$$scope: { ctx }
  			}
  		});

  	return {
  		c() {
  			create_component(graphic.$$.fragment);
  			t = space();
  			create_component(text_1.$$.fragment);
  		},
  		m(target, anchor) {
  			mount_component(graphic, target, anchor);
  			insert(target, t, anchor);
  			mount_component(text_1, target, anchor);
  			current = true;
  		},
  		p(ctx, dirty) {
  			const graphic_changes = {};

  			if (dirty & /*$$scope*/ 2097152) {
  				graphic_changes.$$scope = { dirty, ctx };
  			}

  			graphic.$set(graphic_changes);
  			const text_1_changes = {};

  			if (dirty & /*$$scope*/ 2097152) {
  				text_1_changes.$$scope = { dirty, ctx };
  			}

  			text_1.$set(text_1_changes);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(graphic.$$.fragment, local);
  			transition_in(text_1.$$.fragment, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(graphic.$$.fragment, local);
  			transition_out(text_1.$$.fragment, local);
  			current = false;
  		},
  		d(detaching) {
  			destroy_component(graphic, detaching);
  			if (detaching) detach(t);
  			destroy_component(text_1, detaching);
  		}
  	};
  }

  // (84:8) <Graphic class="material-icons" aria-hidden="true">
  function create_default_slot_38(ctx) {
  	let t;

  	return {
  		c() {
  			t = text("attach_money");
  		},
  		m(target, anchor) {
  			insert(target, t, anchor);
  		},
  		d(detaching) {
  			if (detaching) detach(t);
  		}
  	};
  }

  // (87:8) <Text>
  function create_default_slot_37(ctx) {
  	let t;

  	return {
  		c() {
  			t = text("Renumeration");
  		},
  		m(target, anchor) {
  			insert(target, t, anchor);
  		},
  		d(detaching) {
  			if (detaching) detach(t);
  		}
  	};
  }

  // (81:6) <Item         href="javascript:void(0)"         on:SMUI:action={() => switchPage('/renumeration')}>
  function create_default_slot_36(ctx) {
  	let t;
  	let current;

  	const graphic = new Graphic({
  			props: {
  				class: "material-icons",
  				"aria-hidden": "true",
  				$$slots: { default: [create_default_slot_38] },
  				$$scope: { ctx }
  			}
  		});

  	const text_1 = new Text({
  			props: {
  				$$slots: { default: [create_default_slot_37] },
  				$$scope: { ctx }
  			}
  		});

  	return {
  		c() {
  			create_component(graphic.$$.fragment);
  			t = space();
  			create_component(text_1.$$.fragment);
  		},
  		m(target, anchor) {
  			mount_component(graphic, target, anchor);
  			insert(target, t, anchor);
  			mount_component(text_1, target, anchor);
  			current = true;
  		},
  		p(ctx, dirty) {
  			const graphic_changes = {};

  			if (dirty & /*$$scope*/ 2097152) {
  				graphic_changes.$$scope = { dirty, ctx };
  			}

  			graphic.$set(graphic_changes);
  			const text_1_changes = {};

  			if (dirty & /*$$scope*/ 2097152) {
  				text_1_changes.$$scope = { dirty, ctx };
  			}

  			text_1.$set(text_1_changes);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(graphic.$$.fragment, local);
  			transition_in(text_1.$$.fragment, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(graphic.$$.fragment, local);
  			transition_out(text_1.$$.fragment, local);
  			current = false;
  		},
  		d(detaching) {
  			destroy_component(graphic, detaching);
  			if (detaching) detach(t);
  			destroy_component(text_1, detaching);
  		}
  	};
  }

  // (92:8) <Graphic class="material-icons" aria-hidden="true">
  function create_default_slot_35(ctx) {
  	let t;

  	return {
  		c() {
  			t = text("star");
  		},
  		m(target, anchor) {
  			insert(target, t, anchor);
  		},
  		d(detaching) {
  			if (detaching) detach(t);
  		}
  	};
  }

  // (93:8) <Text>
  function create_default_slot_34(ctx) {
  	let t;

  	return {
  		c() {
  			t = text("Data Privacy");
  		},
  		m(target, anchor) {
  			insert(target, t, anchor);
  		},
  		d(detaching) {
  			if (detaching) detach(t);
  		}
  	};
  }

  // (89:6) <Item         href="javascript:void(0)"         on:SMUI:action={() => switchPage('/privacy')}>
  function create_default_slot_33(ctx) {
  	let t;
  	let current;

  	const graphic = new Graphic({
  			props: {
  				class: "material-icons",
  				"aria-hidden": "true",
  				$$slots: { default: [create_default_slot_35] },
  				$$scope: { ctx }
  			}
  		});

  	const text_1 = new Text({
  			props: {
  				$$slots: { default: [create_default_slot_34] },
  				$$scope: { ctx }
  			}
  		});

  	return {
  		c() {
  			create_component(graphic.$$.fragment);
  			t = space();
  			create_component(text_1.$$.fragment);
  		},
  		m(target, anchor) {
  			mount_component(graphic, target, anchor);
  			insert(target, t, anchor);
  			mount_component(text_1, target, anchor);
  			current = true;
  		},
  		p(ctx, dirty) {
  			const graphic_changes = {};

  			if (dirty & /*$$scope*/ 2097152) {
  				graphic_changes.$$scope = { dirty, ctx };
  			}

  			graphic.$set(graphic_changes);
  			const text_1_changes = {};

  			if (dirty & /*$$scope*/ 2097152) {
  				text_1_changes.$$scope = { dirty, ctx };
  			}

  			text_1.$set(text_1_changes);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(graphic.$$.fragment, local);
  			transition_in(text_1.$$.fragment, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(graphic.$$.fragment, local);
  			transition_out(text_1.$$.fragment, local);
  			current = false;
  		},
  		d(detaching) {
  			destroy_component(graphic, detaching);
  			if (detaching) detach(t);
  			destroy_component(text_1, detaching);
  		}
  	};
  }

  // (76:4) <List>
  function create_default_slot_32(ctx) {
  	let t0;
  	let t1;
  	let current;

  	const item0 = new Item({
  			props: {
  				href: "javascript:void(0)",
  				$$slots: { default: [create_default_slot_39] },
  				$$scope: { ctx }
  			}
  		});

  	item0.$on("SMUI:action", /*SMUI_action_handler*/ ctx[6]);

  	const item1 = new Item({
  			props: {
  				href: "javascript:void(0)",
  				$$slots: { default: [create_default_slot_36] },
  				$$scope: { ctx }
  			}
  		});

  	item1.$on("SMUI:action", /*SMUI_action_handler_1*/ ctx[7]);

  	const item2 = new Item({
  			props: {
  				href: "javascript:void(0)",
  				$$slots: { default: [create_default_slot_33] },
  				$$scope: { ctx }
  			}
  		});

  	item2.$on("SMUI:action", /*SMUI_action_handler_2*/ ctx[8]);

  	return {
  		c() {
  			create_component(item0.$$.fragment);
  			t0 = space();
  			create_component(item1.$$.fragment);
  			t1 = space();
  			create_component(item2.$$.fragment);
  		},
  		m(target, anchor) {
  			mount_component(item0, target, anchor);
  			insert(target, t0, anchor);
  			mount_component(item1, target, anchor);
  			insert(target, t1, anchor);
  			mount_component(item2, target, anchor);
  			current = true;
  		},
  		p(ctx, dirty) {
  			const item0_changes = {};

  			if (dirty & /*$$scope*/ 2097152) {
  				item0_changes.$$scope = { dirty, ctx };
  			}

  			item0.$set(item0_changes);
  			const item1_changes = {};

  			if (dirty & /*$$scope*/ 2097152) {
  				item1_changes.$$scope = { dirty, ctx };
  			}

  			item1.$set(item1_changes);
  			const item2_changes = {};

  			if (dirty & /*$$scope*/ 2097152) {
  				item2_changes.$$scope = { dirty, ctx };
  			}

  			item2.$set(item2_changes);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(item0.$$.fragment, local);
  			transition_in(item1.$$.fragment, local);
  			transition_in(item2.$$.fragment, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(item0.$$.fragment, local);
  			transition_out(item1.$$.fragment, local);
  			transition_out(item2.$$.fragment, local);
  			current = false;
  		},
  		d(detaching) {
  			destroy_component(item0, detaching);
  			if (detaching) detach(t0);
  			destroy_component(item1, detaching);
  			if (detaching) detach(t1);
  			destroy_component(item2, detaching);
  		}
  	};
  }

  // (97:4) <Subheader component={H4}>
  function create_default_slot_31(ctx) {
  	let t;

  	return {
  		c() {
  			t = text("Analysis (coming soon)");
  		},
  		m(target, anchor) {
  			insert(target, t, anchor);
  		},
  		d(detaching) {
  			if (detaching) detach(t);
  		}
  	};
  }

  // (102:8) <Graphic class="material-icons" aria-hidden="true">
  function create_default_slot_30(ctx) {
  	let t;

  	return {
  		c() {
  			t = text("table_chart");
  		},
  		m(target, anchor) {
  			insert(target, t, anchor);
  		},
  		d(detaching) {
  			if (detaching) detach(t);
  		}
  	};
  }

  // (103:8) <Text>
  function create_default_slot_29(ctx) {
  	let t;

  	return {
  		c() {
  			t = text("Nodal Analysis");
  		},
  		m(target, anchor) {
  			insert(target, t, anchor);
  		},
  		d(detaching) {
  			if (detaching) detach(t);
  		}
  	};
  }

  // (99:6) <Item         href="javascript:void(0)"         on:SMUI:action={() => switchPage('/analysis/nodal')}>
  function create_default_slot_28(ctx) {
  	let t;
  	let current;

  	const graphic = new Graphic({
  			props: {
  				class: "material-icons",
  				"aria-hidden": "true",
  				$$slots: { default: [create_default_slot_30] },
  				$$scope: { ctx }
  			}
  		});

  	const text_1 = new Text({
  			props: {
  				$$slots: { default: [create_default_slot_29] },
  				$$scope: { ctx }
  			}
  		});

  	return {
  		c() {
  			create_component(graphic.$$.fragment);
  			t = space();
  			create_component(text_1.$$.fragment);
  		},
  		m(target, anchor) {
  			mount_component(graphic, target, anchor);
  			insert(target, t, anchor);
  			mount_component(text_1, target, anchor);
  			current = true;
  		},
  		p(ctx, dirty) {
  			const graphic_changes = {};

  			if (dirty & /*$$scope*/ 2097152) {
  				graphic_changes.$$scope = { dirty, ctx };
  			}

  			graphic.$set(graphic_changes);
  			const text_1_changes = {};

  			if (dirty & /*$$scope*/ 2097152) {
  				text_1_changes.$$scope = { dirty, ctx };
  			}

  			text_1.$set(text_1_changes);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(graphic.$$.fragment, local);
  			transition_in(text_1.$$.fragment, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(graphic.$$.fragment, local);
  			transition_out(text_1.$$.fragment, local);
  			current = false;
  		},
  		d(detaching) {
  			destroy_component(graphic, detaching);
  			if (detaching) detach(t);
  			destroy_component(text_1, detaching);
  		}
  	};
  }

  // (108:8) <Graphic class="material-icons" aria-hidden="true">
  function create_default_slot_27(ctx) {
  	let t;

  	return {
  		c() {
  			t = text("multiline_chart");
  		},
  		m(target, anchor) {
  			insert(target, t, anchor);
  		},
  		d(detaching) {
  			if (detaching) detach(t);
  		}
  	};
  }

  // (111:8) <Text>
  function create_default_slot_26(ctx) {
  	let t;

  	return {
  		c() {
  			t = text("Network Visualization");
  		},
  		m(target, anchor) {
  			insert(target, t, anchor);
  		},
  		d(detaching) {
  			if (detaching) detach(t);
  		}
  	};
  }

  // (105:6) <Item         href="javascript:void(0)"         on:SMUI:action={() => switchPage('/analysis/network')}>
  function create_default_slot_25(ctx) {
  	let t;
  	let current;

  	const graphic = new Graphic({
  			props: {
  				class: "material-icons",
  				"aria-hidden": "true",
  				$$slots: { default: [create_default_slot_27] },
  				$$scope: { ctx }
  			}
  		});

  	const text_1 = new Text({
  			props: {
  				$$slots: { default: [create_default_slot_26] },
  				$$scope: { ctx }
  			}
  		});

  	return {
  		c() {
  			create_component(graphic.$$.fragment);
  			t = space();
  			create_component(text_1.$$.fragment);
  		},
  		m(target, anchor) {
  			mount_component(graphic, target, anchor);
  			insert(target, t, anchor);
  			mount_component(text_1, target, anchor);
  			current = true;
  		},
  		p(ctx, dirty) {
  			const graphic_changes = {};

  			if (dirty & /*$$scope*/ 2097152) {
  				graphic_changes.$$scope = { dirty, ctx };
  			}

  			graphic.$set(graphic_changes);
  			const text_1_changes = {};

  			if (dirty & /*$$scope*/ 2097152) {
  				text_1_changes.$$scope = { dirty, ctx };
  			}

  			text_1.$set(text_1_changes);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(graphic.$$.fragment, local);
  			transition_in(text_1.$$.fragment, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(graphic.$$.fragment, local);
  			transition_out(text_1.$$.fragment, local);
  			current = false;
  		},
  		d(detaching) {
  			destroy_component(graphic, detaching);
  			if (detaching) detach(t);
  			destroy_component(text_1, detaching);
  		}
  	};
  }

  // (98:4) <List>
  function create_default_slot_24(ctx) {
  	let t;
  	let current;

  	const item0 = new Item({
  			props: {
  				href: "javascript:void(0)",
  				$$slots: { default: [create_default_slot_28] },
  				$$scope: { ctx }
  			}
  		});

  	item0.$on("SMUI:action", /*SMUI_action_handler_3*/ ctx[9]);

  	const item1 = new Item({
  			props: {
  				href: "javascript:void(0)",
  				$$slots: { default: [create_default_slot_25] },
  				$$scope: { ctx }
  			}
  		});

  	item1.$on("SMUI:action", /*SMUI_action_handler_4*/ ctx[10]);

  	return {
  		c() {
  			create_component(item0.$$.fragment);
  			t = space();
  			create_component(item1.$$.fragment);
  		},
  		m(target, anchor) {
  			mount_component(item0, target, anchor);
  			insert(target, t, anchor);
  			mount_component(item1, target, anchor);
  			current = true;
  		},
  		p(ctx, dirty) {
  			const item0_changes = {};

  			if (dirty & /*$$scope*/ 2097152) {
  				item0_changes.$$scope = { dirty, ctx };
  			}

  			item0.$set(item0_changes);
  			const item1_changes = {};

  			if (dirty & /*$$scope*/ 2097152) {
  				item1_changes.$$scope = { dirty, ctx };
  			}

  			item1.$set(item1_changes);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(item0.$$.fragment, local);
  			transition_in(item1.$$.fragment, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(item0.$$.fragment, local);
  			transition_out(item1.$$.fragment, local);
  			current = false;
  		},
  		d(detaching) {
  			destroy_component(item0, detaching);
  			if (detaching) detach(t);
  			destroy_component(item1, detaching);
  		}
  	};
  }

  // (115:6) <Title>
  function create_default_slot_23(ctx) {
  	let t;

  	return {
  		c() {
  			t = text("Questionnaires");
  		},
  		m(target, anchor) {
  			insert(target, t, anchor);
  		},
  		d(detaching) {
  			if (detaching) detach(t);
  		}
  	};
  }

  // (116:6) <Subtitle>
  function create_default_slot_22(ctx) {
  	let t;

  	return {
  		c() {
  			t = text("General Questionnaire information");
  		},
  		m(target, anchor) {
  			insert(target, t, anchor);
  		},
  		d(detaching) {
  			if (detaching) detach(t);
  		}
  	};
  }

  // (114:4) <Header on:click={() => switchPage('/questions/')}>
  function create_default_slot_21(ctx) {
  	let t;
  	let current;

  	const title_1 = new Title({
  			props: {
  				$$slots: { default: [create_default_slot_23] },
  				$$scope: { ctx }
  			}
  		});

  	const subtitle = new Subtitle({
  			props: {
  				$$slots: { default: [create_default_slot_22] },
  				$$scope: { ctx }
  			}
  		});

  	return {
  		c() {
  			create_component(title_1.$$.fragment);
  			t = space();
  			create_component(subtitle.$$.fragment);
  		},
  		m(target, anchor) {
  			mount_component(title_1, target, anchor);
  			insert(target, t, anchor);
  			mount_component(subtitle, target, anchor);
  			current = true;
  		},
  		p(ctx, dirty) {
  			const title_1_changes = {};

  			if (dirty & /*$$scope*/ 2097152) {
  				title_1_changes.$$scope = { dirty, ctx };
  			}

  			title_1.$set(title_1_changes);
  			const subtitle_changes = {};

  			if (dirty & /*$$scope*/ 2097152) {
  				subtitle_changes.$$scope = { dirty, ctx };
  			}

  			subtitle.$set(subtitle_changes);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(title_1.$$.fragment, local);
  			transition_in(subtitle.$$.fragment, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(title_1.$$.fragment, local);
  			transition_out(subtitle.$$.fragment, local);
  			current = false;
  		},
  		d(detaching) {
  			destroy_component(title_1, detaching);
  			if (detaching) detach(t);
  			destroy_component(subtitle, detaching);
  		}
  	};
  }

  // (119:4) <Subheader component={H4}>
  function create_default_slot_20(ctx) {
  	let t;

  	return {
  		c() {
  			t = text("Intrapersonal");
  		},
  		m(target, anchor) {
  			insert(target, t, anchor);
  		},
  		d(detaching) {
  			if (detaching) detach(t);
  		}
  	};
  }

  // (124:8) <Graphic class="material-icons" aria-hidden="true">
  function create_default_slot_19(ctx) {
  	let t;

  	return {
  		c() {
  			t = text("ballot");
  		},
  		m(target, anchor) {
  			insert(target, t, anchor);
  		},
  		d(detaching) {
  			if (detaching) detach(t);
  		}
  	};
  }

  // (125:8) <Text>
  function create_default_slot_18(ctx) {
  	let t;

  	return {
  		c() {
  			t = text("K-10");
  		},
  		m(target, anchor) {
  			insert(target, t, anchor);
  		},
  		d(detaching) {
  			if (detaching) detach(t);
  		}
  	};
  }

  // (121:6) <Item         href="javascript:void(0)"         on:SMUI:action={() => switchPage('/questions/intra/k10')}>
  function create_default_slot_17(ctx) {
  	let t;
  	let current;

  	const graphic = new Graphic({
  			props: {
  				class: "material-icons",
  				"aria-hidden": "true",
  				$$slots: { default: [create_default_slot_19] },
  				$$scope: { ctx }
  			}
  		});

  	const text_1 = new Text({
  			props: {
  				$$slots: { default: [create_default_slot_18] },
  				$$scope: { ctx }
  			}
  		});

  	return {
  		c() {
  			create_component(graphic.$$.fragment);
  			t = space();
  			create_component(text_1.$$.fragment);
  		},
  		m(target, anchor) {
  			mount_component(graphic, target, anchor);
  			insert(target, t, anchor);
  			mount_component(text_1, target, anchor);
  			current = true;
  		},
  		p(ctx, dirty) {
  			const graphic_changes = {};

  			if (dirty & /*$$scope*/ 2097152) {
  				graphic_changes.$$scope = { dirty, ctx };
  			}

  			graphic.$set(graphic_changes);
  			const text_1_changes = {};

  			if (dirty & /*$$scope*/ 2097152) {
  				text_1_changes.$$scope = { dirty, ctx };
  			}

  			text_1.$set(text_1_changes);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(graphic.$$.fragment, local);
  			transition_in(text_1.$$.fragment, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(graphic.$$.fragment, local);
  			transition_out(text_1.$$.fragment, local);
  			current = false;
  		},
  		d(detaching) {
  			destroy_component(graphic, detaching);
  			if (detaching) detach(t);
  			destroy_component(text_1, detaching);
  		}
  	};
  }

  // (130:8) <Graphic class="material-icons" aria-hidden="true">
  function create_default_slot_16(ctx) {
  	let t;

  	return {
  		c() {
  			t = text("ballot");
  		},
  		m(target, anchor) {
  			insert(target, t, anchor);
  		},
  		d(detaching) {
  			if (detaching) detach(t);
  		}
  	};
  }

  // (131:8) <Text>
  function create_default_slot_15(ctx) {
  	let t;

  	return {
  		c() {
  			t = text("HUMS");
  		},
  		m(target, anchor) {
  			insert(target, t, anchor);
  		},
  		d(detaching) {
  			if (detaching) detach(t);
  		}
  	};
  }

  // (127:6) <Item         href="javascript:void(0)"         on:SMUI:action={() => switchPage('/questions/intra/hums')}>
  function create_default_slot_14(ctx) {
  	let t;
  	let current;

  	const graphic = new Graphic({
  			props: {
  				class: "material-icons",
  				"aria-hidden": "true",
  				$$slots: { default: [create_default_slot_16] },
  				$$scope: { ctx }
  			}
  		});

  	const text_1 = new Text({
  			props: {
  				$$slots: { default: [create_default_slot_15] },
  				$$scope: { ctx }
  			}
  		});

  	return {
  		c() {
  			create_component(graphic.$$.fragment);
  			t = space();
  			create_component(text_1.$$.fragment);
  		},
  		m(target, anchor) {
  			mount_component(graphic, target, anchor);
  			insert(target, t, anchor);
  			mount_component(text_1, target, anchor);
  			current = true;
  		},
  		p(ctx, dirty) {
  			const graphic_changes = {};

  			if (dirty & /*$$scope*/ 2097152) {
  				graphic_changes.$$scope = { dirty, ctx };
  			}

  			graphic.$set(graphic_changes);
  			const text_1_changes = {};

  			if (dirty & /*$$scope*/ 2097152) {
  				text_1_changes.$$scope = { dirty, ctx };
  			}

  			text_1.$set(text_1_changes);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(graphic.$$.fragment, local);
  			transition_in(text_1.$$.fragment, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(graphic.$$.fragment, local);
  			transition_out(text_1.$$.fragment, local);
  			current = false;
  		},
  		d(detaching) {
  			destroy_component(graphic, detaching);
  			if (detaching) detach(t);
  			destroy_component(text_1, detaching);
  		}
  	};
  }

  // (136:8) <Graphic class="material-icons" aria-hidden="true">
  function create_default_slot_13(ctx) {
  	let t;

  	return {
  		c() {
  			t = text("post_add");
  		},
  		m(target, anchor) {
  			insert(target, t, anchor);
  		},
  		d(detaching) {
  			if (detaching) detach(t);
  		}
  	};
  }

  // (137:8) <Text>
  function create_default_slot_12(ctx) {
  	let t0;
  	let em;

  	return {
  		c() {
  			t0 = text("20-IDIP\n          ");
  			em = element("em");
  			em.textContent = "(Optional)";
  		},
  		m(target, anchor) {
  			insert(target, t0, anchor);
  			insert(target, em, anchor);
  		},
  		d(detaching) {
  			if (detaching) detach(t0);
  			if (detaching) detach(em);
  		}
  	};
  }

  // (133:6) <Item         href="javascript:void(0)"         on:SMUI:action={() => switchPage('/questions/intra/idip20')}>
  function create_default_slot_11(ctx) {
  	let t;
  	let current;

  	const graphic = new Graphic({
  			props: {
  				class: "material-icons",
  				"aria-hidden": "true",
  				$$slots: { default: [create_default_slot_13] },
  				$$scope: { ctx }
  			}
  		});

  	const text_1 = new Text({
  			props: {
  				$$slots: { default: [create_default_slot_12] },
  				$$scope: { ctx }
  			}
  		});

  	return {
  		c() {
  			create_component(graphic.$$.fragment);
  			t = space();
  			create_component(text_1.$$.fragment);
  		},
  		m(target, anchor) {
  			mount_component(graphic, target, anchor);
  			insert(target, t, anchor);
  			mount_component(text_1, target, anchor);
  			current = true;
  		},
  		p(ctx, dirty) {
  			const graphic_changes = {};

  			if (dirty & /*$$scope*/ 2097152) {
  				graphic_changes.$$scope = { dirty, ctx };
  			}

  			graphic.$set(graphic_changes);
  			const text_1_changes = {};

  			if (dirty & /*$$scope*/ 2097152) {
  				text_1_changes.$$scope = { dirty, ctx };
  			}

  			text_1.$set(text_1_changes);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(graphic.$$.fragment, local);
  			transition_in(text_1.$$.fragment, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(graphic.$$.fragment, local);
  			transition_out(text_1.$$.fragment, local);
  			current = false;
  		},
  		d(detaching) {
  			destroy_component(graphic, detaching);
  			if (detaching) detach(t);
  			destroy_component(text_1, detaching);
  		}
  	};
  }

  // (120:4) <List>
  function create_default_slot_10(ctx) {
  	let t0;
  	let t1;
  	let current;

  	const item0 = new Item({
  			props: {
  				href: "javascript:void(0)",
  				$$slots: { default: [create_default_slot_17] },
  				$$scope: { ctx }
  			}
  		});

  	item0.$on("SMUI:action", /*SMUI_action_handler_5*/ ctx[12]);

  	const item1 = new Item({
  			props: {
  				href: "javascript:void(0)",
  				$$slots: { default: [create_default_slot_14] },
  				$$scope: { ctx }
  			}
  		});

  	item1.$on("SMUI:action", /*SMUI_action_handler_6*/ ctx[13]);

  	const item2 = new Item({
  			props: {
  				href: "javascript:void(0)",
  				$$slots: { default: [create_default_slot_11] },
  				$$scope: { ctx }
  			}
  		});

  	item2.$on("SMUI:action", /*SMUI_action_handler_7*/ ctx[14]);

  	return {
  		c() {
  			create_component(item0.$$.fragment);
  			t0 = space();
  			create_component(item1.$$.fragment);
  			t1 = space();
  			create_component(item2.$$.fragment);
  		},
  		m(target, anchor) {
  			mount_component(item0, target, anchor);
  			insert(target, t0, anchor);
  			mount_component(item1, target, anchor);
  			insert(target, t1, anchor);
  			mount_component(item2, target, anchor);
  			current = true;
  		},
  		p(ctx, dirty) {
  			const item0_changes = {};

  			if (dirty & /*$$scope*/ 2097152) {
  				item0_changes.$$scope = { dirty, ctx };
  			}

  			item0.$set(item0_changes);
  			const item1_changes = {};

  			if (dirty & /*$$scope*/ 2097152) {
  				item1_changes.$$scope = { dirty, ctx };
  			}

  			item1.$set(item1_changes);
  			const item2_changes = {};

  			if (dirty & /*$$scope*/ 2097152) {
  				item2_changes.$$scope = { dirty, ctx };
  			}

  			item2.$set(item2_changes);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(item0.$$.fragment, local);
  			transition_in(item1.$$.fragment, local);
  			transition_in(item2.$$.fragment, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(item0.$$.fragment, local);
  			transition_out(item1.$$.fragment, local);
  			transition_out(item2.$$.fragment, local);
  			current = false;
  		},
  		d(detaching) {
  			destroy_component(item0, detaching);
  			if (detaching) detach(t0);
  			destroy_component(item1, detaching);
  			if (detaching) detach(t1);
  			destroy_component(item2, detaching);
  		}
  	};
  }

  // (144:4) <Subheader component={H4}>
  function create_default_slot_9(ctx) {
  	let t;

  	return {
  		c() {
  			t = text("Interpersonal");
  		},
  		m(target, anchor) {
  			insert(target, t, anchor);
  		},
  		d(detaching) {
  			if (detaching) detach(t);
  		}
  	};
  }

  // (149:8) <Graphic class="material-icons" aria-hidden="true">
  function create_default_slot_8(ctx) {
  	let t;

  	return {
  		c() {
  			t = text("ballot");
  		},
  		m(target, anchor) {
  			insert(target, t, anchor);
  		},
  		d(detaching) {
  			if (detaching) detach(t);
  		}
  	};
  }

  // (150:8) <Text>
  function create_default_slot_7$1(ctx) {
  	let t;

  	return {
  		c() {
  			t = text("SSQ-6");
  		},
  		m(target, anchor) {
  			insert(target, t, anchor);
  		},
  		d(detaching) {
  			if (detaching) detach(t);
  		}
  	};
  }

  // (146:6) <Item         href="javascript:void(0)"         on:SMUI:action={() => switchPage('/questions/inter/ssq6')}>
  function create_default_slot_6$2(ctx) {
  	let t;
  	let current;

  	const graphic = new Graphic({
  			props: {
  				class: "material-icons",
  				"aria-hidden": "true",
  				$$slots: { default: [create_default_slot_8] },
  				$$scope: { ctx }
  			}
  		});

  	const text_1 = new Text({
  			props: {
  				$$slots: { default: [create_default_slot_7$1] },
  				$$scope: { ctx }
  			}
  		});

  	return {
  		c() {
  			create_component(graphic.$$.fragment);
  			t = space();
  			create_component(text_1.$$.fragment);
  		},
  		m(target, anchor) {
  			mount_component(graphic, target, anchor);
  			insert(target, t, anchor);
  			mount_component(text_1, target, anchor);
  			current = true;
  		},
  		p(ctx, dirty) {
  			const graphic_changes = {};

  			if (dirty & /*$$scope*/ 2097152) {
  				graphic_changes.$$scope = { dirty, ctx };
  			}

  			graphic.$set(graphic_changes);
  			const text_1_changes = {};

  			if (dirty & /*$$scope*/ 2097152) {
  				text_1_changes.$$scope = { dirty, ctx };
  			}

  			text_1.$set(text_1_changes);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(graphic.$$.fragment, local);
  			transition_in(text_1.$$.fragment, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(graphic.$$.fragment, local);
  			transition_out(text_1.$$.fragment, local);
  			current = false;
  		},
  		d(detaching) {
  			destroy_component(graphic, detaching);
  			if (detaching) detach(t);
  			destroy_component(text_1, detaching);
  		}
  	};
  }

  // (155:8) <Graphic class="material-icons" aria-hidden="true">
  function create_default_slot_5$4(ctx) {
  	let t;

  	return {
  		c() {
  			t = text("post_add");
  		},
  		m(target, anchor) {
  			insert(target, t, anchor);
  		},
  		d(detaching) {
  			if (detaching) detach(t);
  		}
  	};
  }

  // (156:8) <Text>
  function create_default_slot_4$4(ctx) {
  	let t0;
  	let em;

  	return {
  		c() {
  			t0 = text("SSQ-12\n          ");
  			em = element("em");
  			em.textContent = "(Optional)";
  		},
  		m(target, anchor) {
  			insert(target, t0, anchor);
  			insert(target, em, anchor);
  		},
  		d(detaching) {
  			if (detaching) detach(t0);
  			if (detaching) detach(em);
  		}
  	};
  }

  // (152:6) <Item         href="javascript:void(0)"         on:SMUI:action={() => switchPage('/questions/inter/ssq12')}>
  function create_default_slot_3$5(ctx) {
  	let t;
  	let current;

  	const graphic = new Graphic({
  			props: {
  				class: "material-icons",
  				"aria-hidden": "true",
  				$$slots: { default: [create_default_slot_5$4] },
  				$$scope: { ctx }
  			}
  		});

  	const text_1 = new Text({
  			props: {
  				$$slots: { default: [create_default_slot_4$4] },
  				$$scope: { ctx }
  			}
  		});

  	return {
  		c() {
  			create_component(graphic.$$.fragment);
  			t = space();
  			create_component(text_1.$$.fragment);
  		},
  		m(target, anchor) {
  			mount_component(graphic, target, anchor);
  			insert(target, t, anchor);
  			mount_component(text_1, target, anchor);
  			current = true;
  		},
  		p(ctx, dirty) {
  			const graphic_changes = {};

  			if (dirty & /*$$scope*/ 2097152) {
  				graphic_changes.$$scope = { dirty, ctx };
  			}

  			graphic.$set(graphic_changes);
  			const text_1_changes = {};

  			if (dirty & /*$$scope*/ 2097152) {
  				text_1_changes.$$scope = { dirty, ctx };
  			}

  			text_1.$set(text_1_changes);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(graphic.$$.fragment, local);
  			transition_in(text_1.$$.fragment, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(graphic.$$.fragment, local);
  			transition_out(text_1.$$.fragment, local);
  			current = false;
  		},
  		d(detaching) {
  			destroy_component(graphic, detaching);
  			if (detaching) detach(t);
  			destroy_component(text_1, detaching);
  		}
  	};
  }

  // (145:4) <List>
  function create_default_slot_2$7(ctx) {
  	let t;
  	let current;

  	const item0 = new Item({
  			props: {
  				href: "javascript:void(0)",
  				$$slots: { default: [create_default_slot_6$2] },
  				$$scope: { ctx }
  			}
  		});

  	item0.$on("SMUI:action", /*SMUI_action_handler_8*/ ctx[15]);

  	const item1 = new Item({
  			props: {
  				href: "javascript:void(0)",
  				$$slots: { default: [create_default_slot_3$5] },
  				$$scope: { ctx }
  			}
  		});

  	item1.$on("SMUI:action", /*SMUI_action_handler_9*/ ctx[16]);

  	return {
  		c() {
  			create_component(item0.$$.fragment);
  			t = space();
  			create_component(item1.$$.fragment);
  		},
  		m(target, anchor) {
  			mount_component(item0, target, anchor);
  			insert(target, t, anchor);
  			mount_component(item1, target, anchor);
  			current = true;
  		},
  		p(ctx, dirty) {
  			const item0_changes = {};

  			if (dirty & /*$$scope*/ 2097152) {
  				item0_changes.$$scope = { dirty, ctx };
  			}

  			item0.$set(item0_changes);
  			const item1_changes = {};

  			if (dirty & /*$$scope*/ 2097152) {
  				item1_changes.$$scope = { dirty, ctx };
  			}

  			item1.$set(item1_changes);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(item0.$$.fragment, local);
  			transition_in(item1.$$.fragment, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(item0.$$.fragment, local);
  			transition_out(item1.$$.fragment, local);
  			current = false;
  		},
  		d(detaching) {
  			destroy_component(item0, detaching);
  			if (detaching) detach(t);
  			destroy_component(item1, detaching);
  		}
  	};
  }

  // (71:2) <Content>
  function create_default_slot_1$8(ctx) {
  	let t0;
  	let t1;
  	let t2;
  	let t3;
  	let t4;
  	let t5;
  	let t6;
  	let t7;
  	let t8;
  	let t9;
  	let t10;
  	let current;

  	const header0 = new Header({
  			props: {
  				$$slots: { default: [create_default_slot_42] },
  				$$scope: { ctx }
  			}
  		});

  	const list0 = new List({
  			props: {
  				$$slots: { default: [create_default_slot_32] },
  				$$scope: { ctx }
  			}
  		});

  	const separator0 = new Separator({ props: { nav: true } });

  	const subheader0 = new Subheader({
  			props: {
  				component: H4,
  				$$slots: { default: [create_default_slot_31] },
  				$$scope: { ctx }
  			}
  		});

  	const list1 = new List({
  			props: {
  				$$slots: { default: [create_default_slot_24] },
  				$$scope: { ctx }
  			}
  		});

  	const header1 = new Header({
  			props: {
  				$$slots: { default: [create_default_slot_21] },
  				$$scope: { ctx }
  			}
  		});

  	header1.$on("click", /*click_handler_3*/ ctx[11]);
  	const separator1 = new Separator({ props: { nav: true } });

  	const subheader1 = new Subheader({
  			props: {
  				component: H4,
  				$$slots: { default: [create_default_slot_20] },
  				$$scope: { ctx }
  			}
  		});

  	const list2 = new List({
  			props: {
  				$$slots: { default: [create_default_slot_10] },
  				$$scope: { ctx }
  			}
  		});

  	const separator2 = new Separator({ props: { nav: true } });

  	const subheader2 = new Subheader({
  			props: {
  				component: H4,
  				$$slots: { default: [create_default_slot_9] },
  				$$scope: { ctx }
  			}
  		});

  	const list3 = new List({
  			props: {
  				$$slots: { default: [create_default_slot_2$7] },
  				$$scope: { ctx }
  			}
  		});

  	return {
  		c() {
  			create_component(header0.$$.fragment);
  			t0 = space();
  			create_component(list0.$$.fragment);
  			t1 = space();
  			create_component(separator0.$$.fragment);
  			t2 = space();
  			create_component(subheader0.$$.fragment);
  			t3 = space();
  			create_component(list1.$$.fragment);
  			t4 = space();
  			create_component(header1.$$.fragment);
  			t5 = space();
  			create_component(separator1.$$.fragment);
  			t6 = space();
  			create_component(subheader1.$$.fragment);
  			t7 = space();
  			create_component(list2.$$.fragment);
  			t8 = space();
  			create_component(separator2.$$.fragment);
  			t9 = space();
  			create_component(subheader2.$$.fragment);
  			t10 = space();
  			create_component(list3.$$.fragment);
  		},
  		m(target, anchor) {
  			mount_component(header0, target, anchor);
  			insert(target, t0, anchor);
  			mount_component(list0, target, anchor);
  			insert(target, t1, anchor);
  			mount_component(separator0, target, anchor);
  			insert(target, t2, anchor);
  			mount_component(subheader0, target, anchor);
  			insert(target, t3, anchor);
  			mount_component(list1, target, anchor);
  			insert(target, t4, anchor);
  			mount_component(header1, target, anchor);
  			insert(target, t5, anchor);
  			mount_component(separator1, target, anchor);
  			insert(target, t6, anchor);
  			mount_component(subheader1, target, anchor);
  			insert(target, t7, anchor);
  			mount_component(list2, target, anchor);
  			insert(target, t8, anchor);
  			mount_component(separator2, target, anchor);
  			insert(target, t9, anchor);
  			mount_component(subheader2, target, anchor);
  			insert(target, t10, anchor);
  			mount_component(list3, target, anchor);
  			current = true;
  		},
  		p(ctx, dirty) {
  			const header0_changes = {};

  			if (dirty & /*$$scope*/ 2097152) {
  				header0_changes.$$scope = { dirty, ctx };
  			}

  			header0.$set(header0_changes);
  			const list0_changes = {};

  			if (dirty & /*$$scope*/ 2097152) {
  				list0_changes.$$scope = { dirty, ctx };
  			}

  			list0.$set(list0_changes);
  			const subheader0_changes = {};

  			if (dirty & /*$$scope*/ 2097152) {
  				subheader0_changes.$$scope = { dirty, ctx };
  			}

  			subheader0.$set(subheader0_changes);
  			const list1_changes = {};

  			if (dirty & /*$$scope*/ 2097152) {
  				list1_changes.$$scope = { dirty, ctx };
  			}

  			list1.$set(list1_changes);
  			const header1_changes = {};

  			if (dirty & /*$$scope*/ 2097152) {
  				header1_changes.$$scope = { dirty, ctx };
  			}

  			header1.$set(header1_changes);
  			const subheader1_changes = {};

  			if (dirty & /*$$scope*/ 2097152) {
  				subheader1_changes.$$scope = { dirty, ctx };
  			}

  			subheader1.$set(subheader1_changes);
  			const list2_changes = {};

  			if (dirty & /*$$scope*/ 2097152) {
  				list2_changes.$$scope = { dirty, ctx };
  			}

  			list2.$set(list2_changes);
  			const subheader2_changes = {};

  			if (dirty & /*$$scope*/ 2097152) {
  				subheader2_changes.$$scope = { dirty, ctx };
  			}

  			subheader2.$set(subheader2_changes);
  			const list3_changes = {};

  			if (dirty & /*$$scope*/ 2097152) {
  				list3_changes.$$scope = { dirty, ctx };
  			}

  			list3.$set(list3_changes);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(header0.$$.fragment, local);
  			transition_in(list0.$$.fragment, local);
  			transition_in(separator0.$$.fragment, local);
  			transition_in(subheader0.$$.fragment, local);
  			transition_in(list1.$$.fragment, local);
  			transition_in(header1.$$.fragment, local);
  			transition_in(separator1.$$.fragment, local);
  			transition_in(subheader1.$$.fragment, local);
  			transition_in(list2.$$.fragment, local);
  			transition_in(separator2.$$.fragment, local);
  			transition_in(subheader2.$$.fragment, local);
  			transition_in(list3.$$.fragment, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(header0.$$.fragment, local);
  			transition_out(list0.$$.fragment, local);
  			transition_out(separator0.$$.fragment, local);
  			transition_out(subheader0.$$.fragment, local);
  			transition_out(list1.$$.fragment, local);
  			transition_out(header1.$$.fragment, local);
  			transition_out(separator1.$$.fragment, local);
  			transition_out(subheader1.$$.fragment, local);
  			transition_out(list2.$$.fragment, local);
  			transition_out(separator2.$$.fragment, local);
  			transition_out(subheader2.$$.fragment, local);
  			transition_out(list3.$$.fragment, local);
  			current = false;
  		},
  		d(detaching) {
  			destroy_component(header0, detaching);
  			if (detaching) detach(t0);
  			destroy_component(list0, detaching);
  			if (detaching) detach(t1);
  			destroy_component(separator0, detaching);
  			if (detaching) detach(t2);
  			destroy_component(subheader0, detaching);
  			if (detaching) detach(t3);
  			destroy_component(list1, detaching);
  			if (detaching) detach(t4);
  			destroy_component(header1, detaching);
  			if (detaching) detach(t5);
  			destroy_component(separator1, detaching);
  			if (detaching) detach(t6);
  			destroy_component(subheader1, detaching);
  			if (detaching) detach(t7);
  			destroy_component(list2, detaching);
  			if (detaching) detach(t8);
  			destroy_component(separator2, detaching);
  			if (detaching) detach(t9);
  			destroy_component(subheader2, detaching);
  			if (detaching) detach(t10);
  			destroy_component(list3, detaching);
  		}
  	};
  }

  // (70:0) <Drawer variant="dismissible" bind:this={navDrawer} bind:open={drawerOpen}>
  function create_default_slot$b(ctx) {
  	let current;

  	const content = new Content({
  			props: {
  				$$slots: { default: [create_default_slot_1$8] },
  				$$scope: { ctx }
  			}
  		});

  	return {
  		c() {
  			create_component(content.$$.fragment);
  		},
  		m(target, anchor) {
  			mount_component(content, target, anchor);
  			current = true;
  		},
  		p(ctx, dirty) {
  			const content_changes = {};

  			if (dirty & /*$$scope*/ 2097152) {
  				content_changes.$$scope = { dirty, ctx };
  			}

  			content.$set(content_changes);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(content.$$.fragment, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(content.$$.fragment, local);
  			current = false;
  		},
  		d(detaching) {
  			destroy_component(content, detaching);
  		}
  	};
  }

  function create_fragment$D(ctx) {
  	let title_value;
  	let t0;
  	let t1;
  	let updating_open;
  	let t2;
  	let div;
  	let current;
  	document.title = title_value = title;

  	const topappbar = new TopAppBar({
  			props: {
  				variant: "static",
  				style: "background-color: black;",
  				$$slots: { default: [create_default_slot_45] },
  				$$scope: { ctx }
  			}
  		});

  	function drawer_open_binding(value) {
  		/*drawer_open_binding*/ ctx[18].call(null, value);
  	}

  	let drawer_props = {
  		variant: "dismissible",
  		$$slots: { default: [create_default_slot$b] },
  		$$scope: { ctx }
  	};

  	if (/*drawerOpen*/ ctx[1] !== void 0) {
  		drawer_props.open = /*drawerOpen*/ ctx[1];
  	}

  	const drawer = new Drawer({ props: drawer_props });
  	/*drawer_binding*/ ctx[17](drawer);
  	binding_callbacks.push(() => bind(drawer, "open", drawer_open_binding));
  	const router = new Router({ props: { routes } });
  	router.$on("conditionsFailed", /*conditionsFailed_handler*/ ctx[19]);
  	router.$on("routeLoaded", /*routeLoaded_handler*/ ctx[20]);

  	return {
  		c() {
  			t0 = space();
  			create_component(topappbar.$$.fragment);
  			t1 = space();
  			create_component(drawer.$$.fragment);
  			t2 = space();
  			div = element("div");
  			create_component(router.$$.fragment);
  			attr(div, "class", "container");
  		},
  		m(target, anchor) {
  			insert(target, t0, anchor);
  			mount_component(topappbar, target, anchor);
  			insert(target, t1, anchor);
  			mount_component(drawer, target, anchor);
  			insert(target, t2, anchor);
  			insert(target, div, anchor);
  			mount_component(router, div, null);
  			current = true;
  		},
  		p(ctx, [dirty]) {
  			if ((!current || dirty & /*title*/ 0) && title_value !== (title_value = title)) {
  				document.title = title_value;
  			}

  			const topappbar_changes = {};

  			if (dirty & /*$$scope, drawerOpen*/ 2097154) {
  				topappbar_changes.$$scope = { dirty, ctx };
  			}

  			topappbar.$set(topappbar_changes);
  			const drawer_changes = {};

  			if (dirty & /*$$scope*/ 2097152) {
  				drawer_changes.$$scope = { dirty, ctx };
  			}

  			if (!updating_open && dirty & /*drawerOpen*/ 2) {
  				updating_open = true;
  				drawer_changes.open = /*drawerOpen*/ ctx[1];
  				add_flush_callback(() => updating_open = false);
  			}

  			drawer.$set(drawer_changes);
  		},
  		i(local) {
  			if (current) return;
  			transition_in(topappbar.$$.fragment, local);
  			transition_in(drawer.$$.fragment, local);
  			transition_in(router.$$.fragment, local);
  			current = true;
  		},
  		o(local) {
  			transition_out(topappbar.$$.fragment, local);
  			transition_out(drawer.$$.fragment, local);
  			transition_out(router.$$.fragment, local);
  			current = false;
  		},
  		d(detaching) {
  			if (detaching) detach(t0);
  			destroy_component(topappbar, detaching);
  			if (detaching) detach(t1);
  			/*drawer_binding*/ ctx[17](null);
  			destroy_component(drawer, detaching);
  			if (detaching) detach(t2);
  			if (detaching) detach(div);
  			destroy_component(router);
  		}
  	};
  }

  let title = "Homepage";

  function instance$z($$self, $$props, $$invalidate) {
  	let navDrawer; // navigation drawer object
  	let drawerOpen = false;

  	let switchPage = url => {
  		$$invalidate(1, drawerOpen = !drawerOpen);
  		push(url);
  	};

  	const click_handler = () => $$invalidate(1, drawerOpen = !drawerOpen);
  	const click_handler_1 = () => replace("/");
  	const click_handler_2 = () => replace("/api/login");
  	const SMUI_action_handler = () => switchPage("/");
  	const SMUI_action_handler_1 = () => switchPage("/renumeration");
  	const SMUI_action_handler_2 = () => switchPage("/privacy");
  	const SMUI_action_handler_3 = () => switchPage("/analysis/nodal");
  	const SMUI_action_handler_4 = () => switchPage("/analysis/network");
  	const click_handler_3 = () => switchPage("/questions/");
  	const SMUI_action_handler_5 = () => switchPage("/questions/intra/k10");
  	const SMUI_action_handler_6 = () => switchPage("/questions/intra/hums");
  	const SMUI_action_handler_7 = () => switchPage("/questions/intra/idip20");
  	const SMUI_action_handler_8 = () => switchPage("/questions/inter/ssq6");
  	const SMUI_action_handler_9 = () => switchPage("/questions/inter/ssq12");

  	function drawer_binding($$value) {
  		binding_callbacks[$$value ? "unshift" : "push"](() => {
  			$$invalidate(0, navDrawer = $$value);
  		});
  	}

  	function drawer_open_binding(value) {
  		drawerOpen = value;
  		$$invalidate(1, drawerOpen);
  	}

  	const conditionsFailed_handler = event => console.log(`Condition failed ${JSON.stringify(event.detail)}`);
  	const routeLoaded_handler = event => console.log(`Route loaded ${JSON.stringify(event.detail)}`);

  	return [
  		navDrawer,
  		drawerOpen,
  		switchPage,
  		click_handler,
  		click_handler_1,
  		click_handler_2,
  		SMUI_action_handler,
  		SMUI_action_handler_1,
  		SMUI_action_handler_2,
  		SMUI_action_handler_3,
  		SMUI_action_handler_4,
  		click_handler_3,
  		SMUI_action_handler_5,
  		SMUI_action_handler_6,
  		SMUI_action_handler_7,
  		SMUI_action_handler_8,
  		SMUI_action_handler_9,
  		drawer_binding,
  		drawer_open_binding,
  		conditionsFailed_handler,
  		routeLoaded_handler
  	];
  }

  class App extends SvelteComponent {
  	constructor(options) {
  		super();
  		init(this, options, instance$z, create_fragment$D, safe_not_equal, {});
  	}
  }

  const app = new App({
    target: document.body
  });

  return app;

}());
