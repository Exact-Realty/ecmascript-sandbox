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

const createMessageEventListenerFactory =
	(
		addEventListener: typeof EventTarget.prototype.addEventListener,
		removeEventListener: typeof EventTarget.prototype.addEventListener,
		defaultEventTarget: EventTarget,
		parentOrigin: string,
		parent: MessageEventSource | null,
		secret: string | undefined,
		allowUntrusted: boolean,
	) =>
	(
		handler: {
			(data: unknown[]): void;
		},
		worker?: Worker,
	) => {
		if (
			worker &&
			typeof Worker === 'function' &&
			!(worker instanceof Worker)
		) {
			throw new TypeError(
				"'addEventListener' called on an object that does not implement interface EventTarget.",
			);
		}

		const target = worker ? worker : defaultEventTarget;

		const eventListener = worker
			? (event: MessageEvent) => {
					if (!event.isTrusted || !Array.isArray(event.data)) return;

					handler(event.data);
			  }
			: (event: MessageEvent) => {
					if (
						(!allowUntrusted && !event.isTrusted) ||
						event.origin !== parentOrigin ||
						event.source !== parent ||
						!Array.isArray(event.data) ||
						(secret && event.data[0] !== secret)
					)
						return;

					handler(secret ? event.data.slice(1) : event.data);
			  };

		addEventListener.call(
			target,
			'message',
			eventListener as { (event: Event): void },
			false,
		);

		return () =>
			removeEventListener.call(
				target,
				'message',
				eventListener as { (event: Event): void },
				false,
			);
	};

export default createMessageEventListenerFactory;
