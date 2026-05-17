/**
 * Tests for discovery heuristics.
 *
 * Currently focuses on the 0.9.3.1 kiosk/tablet filter, which is
 * consumed by `/tv`, the things-first browser's media/TV recipes,
 * and the area-media-panel renderer. A regression here = tablets
 * suddenly reappear on every media surface.
 */

import { describe, it, expect } from 'vitest';
import { looksLikeKioskOrTablet, isRealMediaSource } from '$lib/discovery/heuristics';

describe('looksLikeKioskOrTablet', () => {
	it('flags Galaxy Tab', () => {
		expect(looksLikeKioskOrTablet('Galaxy Tab A9', 'SM-X115')).toBe(true);
		expect(looksLikeKioskOrTablet('Galaxy Tab', null)).toBe(true);
		// model-only match
		expect(looksLikeKioskOrTablet('Some Player', 'galaxy tab s7')).toBe(true);
	});

	it('flags Fire HD / Fire Tablet', () => {
		expect(looksLikeKioskOrTablet('Fire HD 10', 'KFSUWI')).toBe(true);
		expect(looksLikeKioskOrTablet('Fire Tablet', null)).toBe(true);
	});

	it('flags iPad / iPhone', () => {
		expect(looksLikeKioskOrTablet('iPad 10.2', null)).toBe(true);
		expect(looksLikeKioskOrTablet('iPhone 13', null)).toBe(true);
	});

	it('flags Fully Kiosk / Browser / Kiosk / Chromebook', () => {
		expect(looksLikeKioskOrTablet('Fully Kiosk Browser', null)).toBe(true);
		expect(looksLikeKioskOrTablet('Living Room Kiosk', null)).toBe(true);
		expect(looksLikeKioskOrTablet('Chromebook', null)).toBe(true);
		expect(looksLikeKioskOrTablet('chrome os', null)).toBe(true);
	});

	it('flags wall pixel / wall display (broadsheet hosts)', () => {
		expect(looksLikeKioskOrTablet('Wall Pixel', null)).toBe(true);
		expect(looksLikeKioskOrTablet('Wall Display', null)).toBe(true);
	});

	it('does NOT flag real media players (Sonos, Echo, Google Home, Nest Hub, AVRs)', () => {
		expect(looksLikeKioskOrTablet('Living Room Sonos', 'Beam Gen 2')).toBe(false);
		expect(looksLikeKioskOrTablet('Echo Show', 'Amazon Echo Show 8')).toBe(false);
		expect(looksLikeKioskOrTablet('Google Home Mini', null)).toBe(false);
		expect(looksLikeKioskOrTablet('Kitchen Display', 'Nest Hub Max')).toBe(false);
		expect(looksLikeKioskOrTablet('Living Room AVR', 'Denon X3700H')).toBe(false);
	});

	it('does NOT flag a TV (TVs go through the tvs bucket separately)', () => {
		expect(looksLikeKioskOrTablet('Living Room TV', 'TCL 65V6C-UK')).toBe(false);
	});

	it('is case-insensitive', () => {
		expect(looksLikeKioskOrTablet('GALAXY TAB A9', 'SM-X115')).toBe(true);
		expect(looksLikeKioskOrTablet('galaxy tab', null)).toBe(true);
	});
});

describe('isRealMediaSource', () => {
	it('returns true for entity shapes with no kiosk signal', () => {
		expect(isRealMediaSource({ name: 'Sonos' })).toBe(true);
		expect(isRealMediaSource({ name: 'Sonos', device: { model: 'Beam Gen 2' } })).toBe(true);
		expect(isRealMediaSource({ name: 'Sonos', device: null })).toBe(true);
	});

	it('returns false for kiosks + tablets', () => {
		expect(isRealMediaSource({ name: 'Galaxy Tab A9', device: { model: 'SM-X115' } })).toBe(false);
		expect(isRealMediaSource({ name: 'Fire HD 10', device: null })).toBe(false);
	});
});
