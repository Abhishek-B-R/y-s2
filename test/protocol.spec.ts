import { decoding } from 'lib0';
import { describe, expect, it } from 'vitest';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as Y from 'yjs';
import { encodeAwarenessUpdate, encodeAwarenessUserDisconnected, mergeMessages, messageAwareness } from '../src/protocol';

function awarenessMessage(state: Record<string, unknown>): { clientID: number; message: Uint8Array } {
	const aw = new awarenessProtocol.Awareness(new Y.Doc());
	aw.setLocalState(state);
	return { clientID: aw.clientID, message: encodeAwarenessUpdate(aw, [aw.clientID]) };
}

function encodedAwarenessClients(messages: Uint8Array[]): number[] {
	const clients: number[] = [];
	for (const m of messages) {
		const decoder = decoding.createDecoder(m);
		if (decoding.readVarUint(decoder) !== messageAwareness) continue;
		const update = decoding.createDecoder(decoding.readVarUint8Array(decoder));
		const count = decoding.readVarUint(update);
		for (let i = 0; i < count; i++) {
			clients.push(decoding.readVarUint(update));
			decoding.readVarUint(update); // clock
			decoding.readVarString(update); // state
		}
	}
	return clients.sort((x, y) => x - y);
}

describe('mergeMessages', () => {
	it('only encodes the awareness clients from its input', () => {
		const a = awarenessMessage({ user: 'a' });
		const b = awarenessMessage({ user: 'b' });

		const merged = mergeMessages([a.message, b.message]);

		expect(encodedAwarenessClients(merged)).toEqual([a.clientID, b.clientID].sort((x, y) => x - y));
	});

	it('keeps a disconnect so receivers drop the client', () => {
		const a = awarenessMessage({ user: 'a' });
		const b = awarenessMessage({ user: 'b' });
		const receiver = new awarenessProtocol.Awareness(new Y.Doc());
		for (const { message } of [a, b]) {
			const decoder = decoding.createDecoder(message);
			decoding.readVarUint(decoder);
			awarenessProtocol.applyAwarenessUpdate(receiver, decoding.readVarUint8Array(decoder), null);
		}

		const merged = mergeMessages([b.message, encodeAwarenessUserDisconnected(a.clientID, 1)]);
		for (const m of merged) {
			const decoder = decoding.createDecoder(m);
			if (decoding.readVarUint(decoder) === messageAwareness) {
				awarenessProtocol.applyAwarenessUpdate(receiver, decoding.readVarUint8Array(decoder), null);
			}
		}

		expect(receiver.getStates().has(a.clientID)).toBe(false);
		expect(receiver.getStates().get(b.clientID)).toEqual({ user: 'b' });
	});
});
