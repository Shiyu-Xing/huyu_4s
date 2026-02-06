import * as pc from 'playcanvas';
window.pc = pc;

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('application-canvas'));
window.focus();

const createDataStore = () => {
	const values = new Map();
	const listeners = new Map();

	const emit = (eventName, value) => {
		const callbacks = listeners.get(eventName);
		if (!callbacks) {
			return;
		}
		callbacks.forEach((callback) => callback(value));
	};

	return {
		on: (eventName, callback) => {
			if (!listeners.has(eventName)) {
				listeners.set(eventName, new Set());
			}
			listeners.get(eventName).add(callback);
		},
		off: (eventName, callback) => {
			const callbacks = listeners.get(eventName);
			if (!callbacks) {
				return;
			}
			callbacks.delete(callback);
			if (callbacks.size === 0) {
				listeners.delete(eventName);
			}
		},
		set: (key, value) => {
			values.set(key, value);
			emit(`${key}:set`, value);
		},
		get: (key) => values.get(key)
	};
};

const data = createDataStore();

const gfxOptions = {
    deviceTypes: [pc.DEVICE_TYPE_WEBGPU, pc.DEVICE_TYPE_WEBGL2],
    antialias: false
};

const device = await pc.createGraphicsDevice(canvas, gfxOptions);
device.maxPixelRatio = Math.min(window.devicePixelRatio ?? 1, 2);

const createOptions = new pc.AppOptions();
createOptions.graphicsDevice = device;
createOptions.mouse = new pc.Mouse(document.body);
createOptions.touch = new pc.TouchDevice(document.body);

createOptions.componentSystems = [
	pc.RenderComponentSystem,
	pc.CameraComponentSystem,
	pc.LightComponentSystem,
	pc.ScriptComponentSystem,
	pc.GSplatComponentSystem
];
createOptions.resourceHandlers = [pc.TextureHandler, pc.ContainerHandler, pc.ScriptHandler, pc.GSplatHandler];

const app = new pc.AppBase(canvas);
app.init(createOptions);

// Set the canvas to fill the window and automatically change resolution to be the same as the canvas size
app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
app.setCanvasResolution(pc.RESOLUTION_AUTO);

// Ensure canvas is resized when window changes size
const resize = () => app.resizeCanvas();
window.addEventListener('resize', resize);
app.on('destroy', () => {
	window.removeEventListener('resize', resize);
});

const createLoadingOverlay = () => {
	const overlay = document.createElement('div');
	overlay.style.position = 'absolute';
	overlay.style.left = '50%';
	overlay.style.top = '24px';
	overlay.style.transform = 'translateX(-50%)';
	overlay.style.padding = '10px 18px';
	overlay.style.borderRadius = '999px';
	overlay.style.background = 'rgba(0, 0, 0, 0.55)';
	overlay.style.color = '#ffffff';
	overlay.style.fontFamily = 'monospace';
	overlay.style.fontSize = '30px';
	overlay.style.letterSpacing = '0.04em';
	overlay.style.pointerEvents = 'none';
	overlay.style.zIndex = '20';

	const text = document.createElement('span');
	overlay.appendChild(text);
	document.body.appendChild(overlay);

	return {
		setProgress: (percent) => {
			text.textContent = `Loading ${percent}%`;
		},
		setError: () => {
			text.textContent = 'Loading failed';
		},
		destroy: () => {
			overlay.remove();
		}
	};
};

let sliderStylesInjected = false;
const ensureSliderStyles = () => {
	if (sliderStylesInjected) {
		return;
	}
	sliderStylesInjected = true;
	const style = document.createElement('style');
	style.textContent = `input[data-ftgs-slider]{appearance:none;height:6px;border-radius:999px;background:rgba(255,255,255,0.2);outline:none}input[data-ftgs-slider]::-webkit-slider-thumb{appearance:none;width:18px;height:18px;border-radius:50%;background:#ffb347;border:none}input[data-ftgs-slider]::-moz-range-thumb{width:18px;height:18px;border-radius:50%;background:#ffb347;border:none}`;
	document.head.appendChild(style);
};

const resolveAssetUrl = (relativePath) => new URL(relativePath, import.meta.url).toString();

const assets = {
	gs1: new pc.Asset('gsplat-1', 'gsplat', { url: resolveAssetUrl('https://cdn.jsdelivr.net/gh/Shiyu-Xing/huyu_4s/yixuan_4s.ply') }),
	orbit: new pc.Asset('script', 'script', { url: resolveAssetUrl('https://cdn.jsdelivr.net/gh/Shiyu-Xing/huyu_4s/orbit-camera.js') })
};

const assetArray = Object.values(assets);
const assetListLoader = new pc.AssetListLoader(assetArray, app.assets);
const loadingOverlay = createLoadingOverlay();
const assetCount = Math.max(1, assetArray.length);
let loadedCount = 0;

const updateLoadingOverlay = () => {
	const percent = Math.round((loadedCount / assetCount) * 100);
	loadingOverlay.setProgress(percent);
};
updateLoadingOverlay();

const handleAssetProgress = () => {
	loadedCount = Math.min(assetCount, loadedCount + 1);
	updateLoadingOverlay();
};

assetListLoader.on('progress', handleAssetProgress);
assetListLoader.once('error', () => {
	loadingOverlay.setError();
});

app.on('destroy', () => {
	assetListLoader.off('progress', handleAssetProgress);
	loadingOverlay.destroy();
});

assetListLoader.load((err) => {
	assetListLoader.off('progress', handleAssetProgress);

	if (err) {
		console.error('Failed to load assets', err);
		loadingOverlay.setError();
		return;
	}

	loadingOverlay.destroy();
	app.start();

	const camera = new pc.Entity();
	camera.addComponent('camera', {
		clearColor: new pc.Color(0.2, 0.2, 0.2),
		toneMapping: pc.TONEMAP_ACES
	});
	camera.setLocalPosition(-3, 1, 2);

	const createEntity = (name, asset) => {
		const entity = new pc.Entity(name);
		entity.addComponent('gsplat', {
			asset
		});
		entity.setLocalPosition(0.0, 1.5, -2);
		entity.setLocalEulerAngles(10, 20, 180);
		entity.setLocalScale(1.0, 1.0, 1.0);
		app.root.addChild(entity);
		return entity;
	};

	const gs1 = createEntity('gsplat-1', assets.gs1);

	camera.addComponent('script');
	camera.script.create('orbitCamera', {
		attributes: {
			inertiaFactor: 0.05,
			focusEntity: gs1,
			distanceMax: 60,
			frameOnStart: false
		}
	});
	camera.script.create('orbitCameraInputMouse');
	camera.script.create('orbitCameraInputTouch');
	app.root.addChild(camera);

	const TIMELINE_MIN = 0;
	const TIMELINE_MAX = 2;
	const TIMELINE_STEP = 0.02;
	const SEGMENT_DURATION = 2;
	const SEGMENT_MAX = SEGMENT_DURATION - TIMELINE_STEP;
	const AUTOPLAY_INTERVAL = TIMELINE_STEP;

	const createTimelineSlider = () => {
		const container = document.createElement('div');
		container.style.position = 'absolute';
		container.style.left = '50%';
		container.style.bottom = '40px';
		container.style.transform = 'translateX(-50%)';
		container.style.padding = '12px 18px';
		container.style.borderRadius = '999px';
		container.style.background = 'rgba(0, 0, 0, 0.45)';
		container.style.backdropFilter = 'blur(6px)';
		container.style.display = 'flex';
		container.style.justifyContent = 'center';
		container.style.alignItems = 'center';
		container.style.gap = '12px';
		container.style.flexWrap = 'nowrap';
		container.style.width = 'min(96vw, 420px)';
		container.style.boxSizing = 'border-box';
		container.style.pointerEvents = 'auto';
		container.style.zIndex = '10';

		ensureSliderStyles();

		const playPauseButton = document.createElement('button');
		playPauseButton.type = 'button';
		playPauseButton.textContent = '||';
		playPauseButton.setAttribute('aria-label', 'Pause playback');
		playPauseButton.style.width = '44px';
		playPauseButton.style.height = '44px';
		playPauseButton.style.borderRadius = '999px';
		playPauseButton.style.border = '1px solid rgba(255, 255, 255, 0.35)';
		playPauseButton.style.background = 'rgba(255, 255, 255, 0.08)';
		playPauseButton.style.color = '#ffffff';
		playPauseButton.style.fontSize = '18px';
		playPauseButton.style.fontWeight = '600';
		playPauseButton.style.cursor = 'pointer';
		playPauseButton.style.display = 'flex';
		playPauseButton.style.alignItems = 'center';
		playPauseButton.style.justifyContent = 'center';
		playPauseButton.style.transition = 'background 0.2s ease';

		container.appendChild(playPauseButton);

		const sliderRow = document.createElement('div');
		sliderRow.style.display = 'flex';
		sliderRow.style.alignItems = 'center';
		sliderRow.style.gap = '10px';
		sliderRow.style.flex = '1 1 auto';
		sliderRow.style.minWidth = '0';

		const slider = document.createElement('input');
		slider.type = 'range';
		slider.min = TIMELINE_MIN.toString();
		slider.max = TIMELINE_MAX.toString();
		slider.step = TIMELINE_STEP.toString();
		slider.value = TIMELINE_MIN.toString();
		slider.style.flex = '1 1 auto';
		slider.style.minWidth = '60px';
		slider.style.maxWidth = '100%';
		slider.style.width = '100%';
		slider.style.cursor = 'pointer';
		slider.style.margin = '0';
		slider.setAttribute('data-ftgs-slider', 'true');
		slider.setAttribute('aria-label', 'Timeline');

		sliderRow.appendChild(slider);

		const label = document.createElement('span');
		label.style.color = '#ffffff';
		label.style.fontSize = '14px';
		label.style.fontFamily = 'monospace';
		label.style.whiteSpace = 'nowrap';
		label.style.flexShrink = '0';
		sliderRow.appendChild(label);

		container.appendChild(sliderRow);

		document.body.appendChild(container);

		const setSliderTrackFill = (value) => {
			const range = TIMELINE_MAX - TIMELINE_MIN;
			const percent = range > 0 ? ((value - TIMELINE_MIN) / range) * 100 : 0;
			slider.style.background = `linear-gradient(90deg, #ffb347 ${percent}%, rgba(255,255,255,0.25) ${percent}%)`;
		};
		setSliderTrackFill(TIMELINE_MIN);

		const stopPointerEvent = (event) => {
			if (event.type === 'pointerdown') {
				isDragging = true;
			} else if (event.type === 'pointerup' || event.type === 'pointercancel') {
				isDragging = false;
			}
			event.stopPropagation();
		};
		const stopMouseEvent = (event) => {
			if (event.type === 'mousedown') {
				isDragging = true;
			} else if (event.type === 'mouseup' || event.type === 'mouseleave') {
				isDragging = false;
			}
			event.stopPropagation();
		};
		const stopTouchEvent = (event) => {
			if (event.type === 'touchstart') {
				isDragging = true;
			} else if (event.type === 'touchend' || event.type === 'touchcancel') {
				isDragging = false;
			}
			event.stopPropagation();
		};
		const handleWheel = (event) => {
			event.stopPropagation();
			event.preventDefault();
		};
		const handleContextMenu = (event) => {
			event.stopPropagation();
			event.preventDefault();
		};
		slider.addEventListener('pointerdown', stopPointerEvent);
		slider.addEventListener('pointermove', stopPointerEvent);
		slider.addEventListener('pointerup', stopPointerEvent);
		slider.addEventListener('pointercancel', stopPointerEvent);
		slider.addEventListener('wheel', handleWheel, { passive: false });
		slider.addEventListener('contextmenu', handleContextMenu);
		slider.addEventListener('mousedown', stopMouseEvent);
		slider.addEventListener('mousemove', stopMouseEvent);
		slider.addEventListener('mouseup', stopMouseEvent);
		slider.addEventListener('mouseleave', stopMouseEvent);
		slider.addEventListener('touchstart', stopTouchEvent, { passive: true });
		slider.addEventListener('touchmove', stopTouchEvent, { passive: true });
		slider.addEventListener('touchend', stopTouchEvent, { passive: true });
		slider.addEventListener('touchcancel', stopTouchEvent, { passive: true });

		return {
			container,
			slider,
			label,
			button: playPauseButton,
			setSliderTrackFill,
			destroy: () => {
				slider.removeEventListener('pointerdown', stopPointerEvent);
				slider.removeEventListener('pointermove', stopPointerEvent);
				slider.removeEventListener('pointerup', stopPointerEvent);
				slider.removeEventListener('pointercancel', stopPointerEvent);
				slider.removeEventListener('wheel', handleWheel);
				slider.removeEventListener('contextmenu', handleContextMenu);
				slider.removeEventListener('mousedown', stopMouseEvent);
				slider.removeEventListener('mousemove', stopMouseEvent);
				slider.removeEventListener('mouseup', stopMouseEvent);
				slider.removeEventListener('mouseleave', stopMouseEvent);
				slider.removeEventListener('touchstart', stopTouchEvent);
				slider.removeEventListener('touchmove', stopTouchEvent);
				slider.removeEventListener('touchend', stopTouchEvent);
				slider.removeEventListener('touchcancel', stopTouchEvent);
				container.remove();
			}
		};
	};

	const timelineUI = createTimelineSlider();
	const { slider: timelineSlider, label: timelineLabel, button: playPauseButton, setSliderTrackFill } = timelineUI;
	let isDragging = false;
	let autoplayAccumulator = 0;
	let currentTimelineValue = TIMELINE_MIN;
	let isPaused = false;

	const applyDynamicToEntity = (entity, value) => {
		const instance = entity?.gsplat?.instance;
		if (!instance || !entity.gsplat?.enabled || !entity.gsplat?.entity.enabled) {
			return;
		}
		instance.applyDynamicState(value);
	};

	const clampTime = (value) => {
		const numericValue = Number.isFinite(value) ? value : TIMELINE_MIN;
		const clamped = pc.math.clamp(numericValue, TIMELINE_MIN, TIMELINE_MAX);
		const snapped = Math.round(clamped / TIMELINE_STEP) * TIMELINE_STEP;
		return pc.math.clamp(snapped, TIMELINE_MIN, TIMELINE_MAX - TIMELINE_STEP);
	};

	const syncSliderValue = (value) => {
		const formatted = value.toFixed(2);
		if (timelineSlider.value !== formatted) {
			timelineSlider.value = formatted;
		}
		timelineLabel.textContent = `${(value * 2).toFixed(1)}s`;
		setSliderTrackFill(value);
	};

	const snapSegmentValue = (value) => {
		const clamped = pc.math.clamp(value, TIMELINE_MIN, SEGMENT_MAX);
		return Math.round(clamped / TIMELINE_STEP) * TIMELINE_STEP;
	};

	const updatePlaybackState = (timelineValue) => {
		const segmentTimeFirst = snapSegmentValue(timelineValue);
		applyDynamicToEntity(gs1, segmentTimeFirst);
	};

	const applyTimelineValue = (rawValue) => {
		const timelineValue = clampTime(rawValue);
		currentTimelineValue = timelineValue;
		updatePlaybackState(timelineValue);
		syncSliderValue(timelineValue);
	};

	const timelineHandler = (value) => {
		applyTimelineValue(value);
	};
	data.on('timeline.uTime:set', timelineHandler);

	const setPlaybackPaused = (paused) => {
		isPaused = paused;
		autoplayAccumulator = 0;
		playPauseButton.textContent = paused ? '▶' : '||';
		playPauseButton.setAttribute('aria-label', paused ? 'Play timeline' : 'Pause playback');
	};

	const handlePlayPauseClick = (event) => {
		event.stopPropagation();
		setPlaybackPaused(!isPaused);
	};

	playPauseButton.addEventListener('click', handlePlayPauseClick);
	setPlaybackPaused(false);

	const onSliderInput = () => {
		const value = parseFloat(timelineSlider.value);
		if (!Number.isNaN(value)) {
			setSliderTrackFill(value);
			data.set('timeline.uTime', value);
		}
	};

	const onUpdate = (dt) => {
		if (isDragging || isPaused) {
			autoplayAccumulator = 0;
			return;
		}

		autoplayAccumulator += dt * 0.5;
		if (autoplayAccumulator >= AUTOPLAY_INTERVAL) {
			autoplayAccumulator -= AUTOPLAY_INTERVAL;

			let nextValue = currentTimelineValue + TIMELINE_STEP;
			if (nextValue > TIMELINE_MAX - TIMELINE_STEP) {
				nextValue = TIMELINE_MIN;
			}
			data.set('timeline.uTime', nextValue);
		}
	};

	timelineSlider.addEventListener('input', onSliderInput);

	app.on('update', onUpdate);

	app.on('destroy', () => {
		data.off('timeline.uTime:set', timelineHandler);
		timelineSlider.removeEventListener('input', onSliderInput);
		playPauseButton.removeEventListener('click', handlePlayPauseClick);
		app.off('update', onUpdate);
		timelineUI.destroy();
	});

	const initialTime = TIMELINE_MIN;
	data.set('timeline.uTime', initialTime);
});

export { app };
