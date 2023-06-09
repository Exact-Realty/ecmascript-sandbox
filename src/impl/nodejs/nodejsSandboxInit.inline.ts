/* Copyright © 2023 Exact Realty Limited.
 *
 * Permission to use, copy, modify, and distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
 * REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
 * AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
 * INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
 * LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
 * OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
 * PERFORMANCE OF THIS SOFTWARE.
 */

import EMessageTypes from '../../EMessageTypes.js';
import * as Logger from '../../lib/Logger.js';
import workerSandboxInner from '../worker/workerSandboxInner.js';

const listener = (event: MessageEvent) => {
	if (
		!event.isTrusted ||
		!Array.isArray(event.data) ||
		event.data[0] !== EMessageTypes.SANDBOX_READY
	)
		return;

	Logger.info('Received SANDBOX_READY from parent. Creating sandbox.');
	self.removeEventListener('message', listener, false);
	// Fix Function prototype
	Object.defineProperty(Function, 'prototype', {
		value: listener.constructor.prototype,
	});
	Function.prototype.apply.call(
		workerSandboxInner,
		null,
		event.data.slice(1),
	);
};

const recreateError = (e: unknown): Error => {
	const newError = Object.create(Error.prototype);
	if (e) {
		newError.message = String(
			(e as Error).message ? (e as Error).message : e,
		);
	}
	if (e && (e as Error).stack) {
		newError.stack = String((e as Error).stack);
	}
	if (e && (e as Error).name !== 'Error') {
		newError.name = String((e as Error).name);
	}

	return newError;
};

// These need to be wrapped because they contain references to the parent
// environment
// Then, the parent needs to delete these functions, which it can do when
// it receives SANDBOX_READY in the next step
const nativeWrapperFactory =
	<T extends Record<string, typeof Function.prototype>>(obj: T) =>
	(name: keyof T) => {
		const fn = obj[name];

		if (typeof fn !== 'function') return;

		Object.defineProperty(obj, name, {
			writable: true,
			enumerable: true,
			configurable: true,
			value: function (...args: unknown[]) {
				try {
					const r = fn.call(obj, ...args);
					if (typeof r !== 'object' && typeof r !== 'function') {
						return r;
					}
				} catch (e: unknown) {
					throw recreateError(e);
				}
			}.bind(obj),
		});
	};

['atob', 'btoa', 'close', 'clearInterval', 'clearTimeout', 'Function'].forEach(
	nativeWrapperFactory(
		self as unknown as Parameters<typeof nativeWrapperFactory>[0],
	),
);

// Messages are forced through JSON.parse(JSON.stringify()) to avoid some attack
// vectors that involve indirect references
(() => {
	const aEL = self.addEventListener;
	const rEL = self.removeEventListener;

	const eventMap = new WeakMap<
		typeof Function.prototype,
		typeof Function.prototype
	>();

	self.addEventListener = (
		function (...args: Parameters<typeof aEL>) {
			const [type, listener] = args;
			if (
				type !== 'message' ||
				typeof listener !== 'function' ||
				eventMap.has(listener)
			)
				return;

			const wrappedListener = (ev: Event) => {
				if (ev.type !== 'message') return;

				Object.defineProperty(ev, 'data', {
					value: JSON.parse(
						JSON.stringify((ev as MessageEvent).data),
					),
				});
				listener(ev);
			};

			eventMap.set(listener, wrappedListener);
			try {
				aEL.call(self, type, wrappedListener, false);
			} catch (e) {
				eventMap.delete(listener);
				throw recreateError(e);
			}
		} as typeof aEL
	).bind(self);

	self.removeEventListener = (
		function (...args: Parameters<typeof rEL>) {
			const [type, listener] = args;
			if (type !== 'message' || typeof listener !== 'function') return;
			const wrappedListener = eventMap.get(listener);
			if (wrappedListener) {
				try {
					rEL.call(
						self,
						type,
						wrappedListener as unknown as typeof listener,
						false,
					);
				} catch (e) {
					throw recreateError(e);
				}
				eventMap.delete(listener);
			}
		} as typeof rEL
	).bind(self);
})();

// Messages are forced through JSON.parse(JSON.stringify()) to avoid some attack
// vectors that involve proxies
(() => {
	const pm = self.postMessage;

	if (typeof pm !== 'function') return;

	self.postMessage = (
		function (...args) {
			try {
				pm.apply(self, JSON.parse(JSON.stringify(args)));
			} catch (e) {
				throw recreateError(e);
			}
		} as typeof pm
	).bind(self);
})();

(() => {
	const grv = self.crypto?.getRandomValues;

	if (typeof grv !== 'function') return;

	self.crypto.getRandomValues = function <T extends ArrayBufferView | null>(
		array: T,
	): T {
		if (!array) return array;

		try {
			const ret = grv(array);

			if (ret !== array || ret?.buffer !== array.buffer) {
				throw new Error('Unexpected return value');
			}
		} catch (e) {
			throw recreateError(e);
		}

		return array;
	}.bind(self);
})();

['setInterval', 'setTimeout'].forEach((v) => {
	const setTimer = (
		self as unknown as Record<string, { (...args: unknown[]): unknown }>
	)[v];

	if (typeof setTimer !== 'function') return;

	(self as unknown as Record<string, typeof setTimer>)[v] = function (
		...args: Parameters<typeof setTimer>
	): unknown {
		try {
			const callback = args[0] as { (...args: unknown[]): unknown };

			// Wrapper around callback to prevent access to the host Array
			// constructor through references
			args[0] = (...params: unknown[]) => {
				Function.prototype.apply.call(
					callback,
					self,
					Array.from(params),
				);
			};

			const ret = setTimer(...args);

			if (typeof ret !== 'number') {
				throw new Error('Unexpected return value');
			}

			return ret;
		} catch (e) {
			throw recreateError(e);
		}
	}.bind(self);
});

Logger.info('Worker started, registering event listener');

self.addEventListener('message', listener, false);
