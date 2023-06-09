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

import webdriver from 'selenium-webdriver';
import { browserTestSuites } from './browserTestSuites';
import getCodeHelper from './getCodeHelper';

const enabledBrowsers = new Set(
	process.env.WEBDRIVER_BROWSERS?.split(/[ ,;]/) ?? [
		webdriver.Browser.CHROME,
		webdriver.Browser.EDGE,
		webdriver.Browser.FIREFOX,
	],
);

['workerSandbox'].forEach((m) =>
	getCodeHelper('../dist/index.mjs', m).then((code) =>
		[
			[webdriver.Browser.CHROME, 'Chrome'],
			[webdriver.Browser.EDGE, 'Edge'],
			[webdriver.Browser.FIREFOX, 'Firefox'],
		]
			.filter(([browserName]) => enabledBrowsers.has(browserName))
			.forEach(([browserName, browserDisplayName]) => {
				describe(
					`Browser: ${browserDisplayName}, module: ${m}`,
					browserTestSuites(code, browserName),
				);
			}),
	),
);
