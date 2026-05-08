(async function init() {
  const [events, placesGeo] = await Promise.all([
    fetch("data/events.json").then((response) => response.json()),
    fetch("data/places.geojson").then((response) => response.json())
  ]);

  const places = new Map(placesGeo.features.map((feature) => [feature.id, feature]));
  const geocodedEvents = events
    .map((event) => ({ ...event, points: getEventPoints(event, places) }))
    .filter((event) => event.points.length > 0)
    .sort((a, b) => a.sequence - b.sequence);
  const placeEventMap = buildPlaceEventMap(geocodedEvents);

  const state = {
    activeEventId: geocodedEvents[0]?.id,
    activePlaceId: null,
    activeCategory: "all",
    query: "",
    playing: false,
    playIndex: 0,
    timer: null,
    viewBox: { x: 0, y: 0, width: 1000, height: 760 },
    taiwanViewBox: { x: 0, y: 0, width: 1000, height: 760 },
    dragging: null,
    taiwanDragging: null,
    touchGesture: null,
    taiwanTouchGesture: null
  };

  const fullViewBox = { x: 0, y: 0, width: 1000, height: 760 };
  const fullTaiwanViewBox = { x: 0, y: 0, width: 1000, height: 760 };
  const namedViewBoxes = {
    all: fullViewBox,
    taiwan: { x: 505, y: 492, width: 235, height: 188 }
  };

  const categoryMeta = {
    all: { label: "全部", color: "#344054" },
    birth: { label: "出生", color: "#b23a48" },
    migration: { label: "迁徙", color: "#d76f30" },
    residence: { label: "居住", color: "#6f5d2e" },
    education: { label: "求学", color: "#1f7a8c" },
    travel: { label: "行旅", color: "#2e6f40" },
    health: { label: "医疗", color: "#8a4f7d" },
    military: { label: "服役", color: "#58606f" },
    imprisonment: { label: "牢狱", color: "#111827" },
    public_memory: { label: "记忆", color: "#9b6a12" },
    public_life: { label: "公共", color: "#3d6f9f" },
    teaching: { label: "任教", color: "#4d6b32" },
    media: { label: "媒体", color: "#8f3f71" },
    politics: { label: "政治", color: "#a13d2d" },
    lecture: { label: "演讲", color: "#0b5cad" },
    speech: { label: "发言", color: "#28666e" },
    writing: { label: "写作", color: "#7a5c2e" },
    publication: { label: "出版", color: "#5a45a0" },
    work: { label: "工作", color: "#486581" },
    lawsuit: { label: "诉讼", color: "#8b2f3c" },
    legal: { label: "司法", color: "#6b3f69" },
    political_pressure: { label: "政治压力", color: "#7c2d12" },
    late_life: { label: "晚年", color: "#5b6472" }
  };

  const placeTypeLabels = {
    address: "地址",
    airport: "机场",
    auditorium: "礼堂",
    bookstore: "书店",
    city: "城市",
    city_area: "城区",
    convention_center: "会议中心",
    court: "法院",
    detention_site: "关押/监所",
    government_building_room: "政府建筑房间",
    heritage_site: "历史遗址",
    hospital: "医院",
    hotel: "饭店/旅馆",
    institution: "机构",
    lake: "湖泊",
    memorial: "纪念地",
    memorial_hall: "纪念馆",
    military_base: "军事基地",
    mixed_use_building: "综合楼宇",
    newspaper_office: "报社",
    police_station: "警局",
    post_office: "邮局",
    publisher: "出版社",
    region: "区域",
    religious_site: "宗教场所",
    research_institute: "研究机构",
    residence: "住所",
    restaurant_event_venue: "餐饮/活动场地",
    room: "房间",
    scenic_site: "景点",
    site: "地点",
    station: "车站",
    study: "书房",
    television_station: "电视台",
    university: "大学",
    village_port: "村落/港口"
  };

  const precisionLabels = {
    address_approx: "地址近似",
    area_approx: "区域近似",
    building_approx: "建筑近似",
    city: "城市级",
    community_approx: "社区近似",
    district_approx: "行政区近似",
    institution_approx: "机构近似",
    region: "区域级",
    site_approx: "地点近似",
    station_approx: "车站近似",
    street_approx: "街道近似",
    unknown: "未知",
    village_approx: "村落近似"
  };

  const svg = document.querySelector("#mapSvg");
  const taiwanSvg = document.querySelector("#taiwanSvg");
  const baseMap = document.querySelector("#baseMap");
  const routeLayer = document.querySelector("#routeLayer");
  const markerLayer = document.querySelector("#markerLayer");
  const taiwanBaseMap = document.querySelector("#taiwanBaseMap");
  const taiwanRouteLayer = document.querySelector("#taiwanRouteLayer");
  const taiwanMarkerLayer = document.querySelector("#taiwanMarkerLayer");
  const timeline = document.querySelector("#timeline");
  const filters = document.querySelector("#categoryFilters");
  const searchInput = document.querySelector("#searchInput");
  const playButton = document.querySelector("#playButton");
  const resetButton = document.querySelector("#resetButton");
  const zoomInButton = document.querySelector("#zoomInButton");
  const zoomOutButton = document.querySelector("#zoomOutButton");
  const focusTaiwanButton = document.querySelector("#focusTaiwanButton");
  const focusAllButton = document.querySelector("#focusAllButton");
  const taiwanZoomInButton = document.querySelector("#taiwanZoomInButton");
  const taiwanZoomOutButton = document.querySelector("#taiwanZoomOutButton");
  const taiwanResetButton = document.querySelector("#taiwanResetButton");

  document.querySelector("#eventCount").textContent = events.length;
  document.querySelector("#placeCount").textContent = placesGeo.features.length;
  document.querySelector("#visibleCount").textContent = geocodedEvents.length;

  drawBaseMap();
  drawTaiwanBaseMap();
  renderFilters();
  setViewBox(state.viewBox);
  setTaiwanViewBox(state.taiwanViewBox);
  render();

  searchInput.addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    state.playing = false;
    stopPlayback();
    render();
  });

  playButton.addEventListener("click", () => {
    if (state.playing) {
      stopPlayback();
    } else {
      startPlayback();
    }
  });

  resetButton.addEventListener("click", () => {
    state.activeCategory = "all";
    state.query = "";
    state.activeEventId = geocodedEvents[0]?.id;
    state.activePlaceId = null;
    searchInput.value = "";
    stopPlayback();
    setNamedView("all");
    setTaiwanViewBox(fullTaiwanViewBox);
    render();
  });

  zoomInButton.addEventListener("click", () => zoomMap(0.72));
  zoomOutButton.addEventListener("click", () => zoomMap(1.38));
  focusTaiwanButton.addEventListener("click", focusTaiwanDetailMap);
  focusAllButton.addEventListener("click", () => setNamedView("all"));
  taiwanZoomInButton.addEventListener("click", () => zoomTaiwanMap(0.72));
  taiwanZoomOutButton.addEventListener("click", () => zoomTaiwanMap(1.38));
  taiwanResetButton.addEventListener("click", () => {
    setTaiwanViewBox(fullTaiwanViewBox);
    renderMap(filteredEvents());
  });

  svg.addEventListener("wheel", (event) => {
    event.preventDefault();
    zoomMap(event.deltaY < 0 ? 0.82 : 1.22, pointerToSvg(event));
  }, { passive: false });

  svg.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "touch") return;
    svg.setPointerCapture(event.pointerId);
    state.dragging = {
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      viewBox: { ...state.viewBox }
    };
    svg.classList.add("dragging");
  });

  svg.addEventListener("pointermove", (event) => {
    if (!state.dragging) return;
    const scaleX = state.viewBox.width / svg.clientWidth;
    const scaleY = state.viewBox.height / svg.clientHeight;
    setViewBox({
      x: state.dragging.viewBox.x - (event.clientX - state.dragging.start.x) * scaleX,
      y: state.dragging.viewBox.y - (event.clientY - state.dragging.start.y) * scaleY,
      width: state.dragging.viewBox.width,
      height: state.dragging.viewBox.height
    });
  });

  svg.addEventListener("pointerup", endDrag);
  svg.addEventListener("pointercancel", endDrag);

  taiwanSvg.addEventListener("wheel", (event) => {
    event.preventDefault();
    zoomTaiwanMap(event.deltaY < 0 ? 0.82 : 1.22, pointerToTaiwanSvg(event));
  }, { passive: false });

  taiwanSvg.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "touch") return;
    taiwanSvg.setPointerCapture(event.pointerId);
    state.taiwanDragging = {
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      viewBox: { ...state.taiwanViewBox }
    };
    taiwanSvg.classList.add("dragging");
  });

  taiwanSvg.addEventListener("pointermove", (event) => {
    if (!state.taiwanDragging) return;
    const scaleX = state.taiwanViewBox.width / taiwanSvg.clientWidth;
    const scaleY = state.taiwanViewBox.height / taiwanSvg.clientHeight;
    setTaiwanViewBox({
      x: state.taiwanDragging.viewBox.x - (event.clientX - state.taiwanDragging.start.x) * scaleX,
      y: state.taiwanDragging.viewBox.y - (event.clientY - state.taiwanDragging.start.y) * scaleY,
      width: state.taiwanDragging.viewBox.width,
      height: state.taiwanDragging.viewBox.height
    });
  });

  taiwanSvg.addEventListener("pointerup", endTaiwanDrag);
  taiwanSvg.addEventListener("pointercancel", endTaiwanDrag);
  addTouchGestures(svg, {
    getViewBox: () => state.viewBox,
    setViewBox,
    getGesture: () => state.touchGesture,
    setGesture: (gesture) => {
      state.touchGesture = gesture;
    },
    zoomClassTarget: svg
  });
  addTouchGestures(taiwanSvg, {
    getViewBox: () => state.taiwanViewBox,
    setViewBox: setTaiwanViewBox,
    getGesture: () => state.taiwanTouchGesture,
    setGesture: (gesture) => {
      state.taiwanTouchGesture = gesture;
    },
    zoomClassTarget: taiwanSvg
  });

  function getEventPoints(event, placeMap) {
    return event.place_ids
      .map((placeId) => placeMap.get(placeId))
      .filter((place) => place?.geometry?.coordinates)
      .map((place) => ({
        id: place.id,
        name: place.properties.name_zh,
        coordinates: place.geometry.coordinates,
        precision: place.properties.coordinate_precision,
        needsReview: place.properties.needs_review
      }));
  }

  function buildPlaceEventMap(items) {
    const map = new Map();
    items.forEach((event) => {
      event.points.forEach((point) => {
        if (!map.has(point.id)) map.set(point.id, []);
        map.get(point.id).push(event);
      });
    });
    return map;
  }

  function filteredEvents() {
    const query = state.query;
    return geocodedEvents.filter((event) => {
      const categoryMatch = state.activeCategory === "all" || event.category === state.activeCategory;
      if (!categoryMatch) return false;
      if (!query) return true;
      const placeText = event.points.map((point) => point.name).join(" ");
      return `${event.date_label} ${event.title} ${event.summary} ${placeText}`.toLowerCase().includes(query);
    });
  }

  function render() {
    const visibleEvents = filteredEvents();
    if (!visibleEvents.some((event) => event.id === state.activeEventId)) {
      state.activeEventId = visibleEvents[0]?.id;
    }
    document.querySelector("#visibleCount").textContent = visibleEvents.length;
    renderTimeline(visibleEvents);
    renderMap(visibleEvents);
    renderPlaceDetail(visibleEvents);
    updateFilterState();
    playButton.textContent = state.playing ? "⏸" : "▶";
    playButton.title = state.playing ? "暂停路线" : "播放路线";
    playButton.setAttribute("aria-label", playButton.title);
  }

  function renderFilters() {
    const categories = ["all", ...new Set(geocodedEvents.map((event) => event.category))];
    filters.innerHTML = categories.map((category) => {
      const meta = getCategoryMeta(category);
      return `<button class="filter-button" type="button" data-category="${category}">${meta.label}</button>`;
    }).join("");

    filters.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => {
        state.activeCategory = button.dataset.category;
        stopPlayback();
        render();
      });
    });
  }

  function updateFilterState() {
    filters.querySelectorAll("button").forEach((button) => {
      button.classList.toggle("active", button.dataset.category === state.activeCategory);
    });
  }

  function renderTimeline(visibleEvents) {
    if (!visibleEvents.length) {
      timeline.innerHTML = `<li class="empty-state">没有匹配的事件</li>`;
      return;
    }

    timeline.innerHTML = visibleEvents.map((event) => {
      const year = String(event.date_start).slice(0, 4);
      const activeClass = event.id === state.activeEventId ? " active" : "";
      return `
        <li>
          <button class="timeline-item${activeClass}" type="button" data-event-id="${event.id}">
            <span class="timeline-year">${year}</span>
            <span>
              <span class="timeline-title">${escapeHtml(event.title)}</span>
              <span class="timeline-summary">${escapeHtml(event.summary)}</span>
            </span>
          </button>
        </li>
      `;
    }).join("");

    timeline.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => {
        selectEvent(button.dataset.eventId);
        stopPlayback();
        render();
      });
    });
  }

  function renderMap(visibleEvents) {
    const mainScale = Math.max(0.07, Math.min(1, state.viewBox.width / fullViewBox.width));
    renderMapLayer({
      visibleEvents,
      routeLayer,
      markerLayer,
      projectFn: project,
      pointFilter: () => true,
      markerScale: mainScale,
      baseRadius: 3.6,
      countRadius: 0.34,
      maxRadius: 6,
      minRadius: 0.36,
      labelSize: 12.5,
      minLabelSize: 1.24,
      labelMode: "main",
      denseLabels: true,
      labelBounds: fullViewBox
    });

    const taiwanScale = Math.max(0.06, Math.min(1, state.taiwanViewBox.width / fullTaiwanViewBox.width));
    const taiwanEvents = visibleEvents.filter((event) => event.points.some((point) => isTaiwanPoint(point)));
    renderMapLayer({
      visibleEvents: taiwanEvents,
      routeLayer: taiwanRouteLayer,
      markerLayer: taiwanMarkerLayer,
      projectFn: projectTaiwan,
      pointFilter: isTaiwanPoint,
      markerScale: taiwanScale,
      baseRadius: 3.6,
      countRadius: 0.34,
      maxRadius: 6,
      minRadius: 0.36,
      labelSize: 12.5,
      minLabelSize: 1.24,
      labelMode: "all",
      denseLabels: true,
      labelBounds: fullTaiwanViewBox
    });
  }

  function renderMapLayer(options) {
    const {
      visibleEvents,
      routeLayer,
      markerLayer,
      projectFn,
      pointFilter,
      markerScale,
      baseRadius,
      countRadius,
      maxRadius,
      minRadius = 0,
      labelSize,
      minLabelSize = 0.65,
      labelMode,
      denseLabels = false,
      labelBounds = null
    } = options;

    routeLayer.innerHTML = "";
    markerLayer.innerHTML = "";

    const routePoints = visibleEvents
      .map((event) => event.points.find(pointFilter))
      .filter(Boolean)
      .map((point) => projectFn(point.coordinates));
    if (routePoints.length > 1) {
      const routePath = document.createElementNS("http://www.w3.org/2000/svg", "path");
      routePath.setAttribute("class", "route-line");
      routePath.setAttribute("d", routePoints.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" "));
      routeLayer.appendChild(routePath);
    }

    const byPlace = new Map();
    visibleEvents.forEach((event) => {
      event.points.filter(pointFilter).forEach((point) => {
        if (!byPlace.has(point.id)) {
          byPlace.set(point.id, { point, events: [] });
        }
        byPlace.get(point.id).events.push(event);
      });
    });

    const entries = separateDensePoints([...byPlace.values()].map((entry) => ({
      ...entry,
      basePosition: projectFn(entry.point.coordinates)
    })), markerScale, denseLabels);
    const placedLabels = [];

    entries.forEach(({ point, events: pointEvents, basePosition, position }) => {
      const active = point.id === state.activePlaceId;
      const category = pointEvents[0].category;
      const meta = getCategoryMeta(category);
      const radius = Math.max(minRadius, Math.min(maxRadius, baseRadius + pointEvents.length * countRadius) * markerScale);
      const computedLabelSize = Math.max(minLabelSize, labelSize * markerScale);
      const shouldShowLabel = shouldRenderLabel(labelMode, point, pointEvents, active);
      const labelPlacement = shouldShowLabel
        ? placeLabel(shortName(point.name), position, radius, computedLabelSize, markerScale, placedLabels, denseLabels, labelBounds)
        : null;
      if (labelPlacement) placedLabels.push(labelPlacement.box);
      const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
      group.setAttribute("class", `marker-group${active ? " active" : ""}`);
      group.setAttribute("tabindex", "0");
      group.setAttribute("role", "button");
      group.setAttribute("aria-label", point.name);
      group.dataset.placeId = point.id;
      group.dataset.eventId = pointEvents[0].id;
      const displaced = distance(basePosition, position) > markerScale * 1.5;
      group.innerHTML = `
        <title>${escapeSvgText(point.name)}</title>
        ${displaced ? `<line class="marker-leader" x1="${basePosition.x}" y1="${basePosition.y}" x2="${position.x}" y2="${position.y}"></line>` : ""}
        ${labelPlacement?.leader ? `<line class="label-leader" x1="${position.x}" y1="${position.y}" x2="${labelPlacement.anchorX}" y2="${labelPlacement.anchorY}"></line>` : ""}
        ${active ? `<circle class="marker-active-ring" cx="${position.x}" cy="${position.y}" r="${Math.max(radius * 3.2, radius + 2.4 * markerScale)}"></circle>` : ""}
        <circle class="marker-halo" cx="${position.x}" cy="${position.y}" r="${radius * 2.1}"></circle>
        <circle class="marker-dot" cx="${position.x}" cy="${position.y}" r="${radius}" fill="${meta.color}"></circle>
        ${labelPlacement ? `<text class="marker-label" x="${labelPlacement.x}" y="${labelPlacement.y}" style="font-size:${computedLabelSize}px">${escapeSvgText(shortName(point.name))}</text>` : ""}
      `;
      group.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
      });
      group.addEventListener("click", (event) => {
        event.stopPropagation();
        selectPlace(point.id, pointEvents[0].id);
        stopPlayback();
        render();
      });
      group.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectPlace(point.id, pointEvents[0].id);
          stopPlayback();
          render();
        }
      });
      markerLayer.appendChild(group);
    });
  }

  function separateDensePoints(entries, markerScale, denseLabels = false) {
    const remaining = [...entries].sort((a, b) => {
      return b.events.length - a.events.length
        || a.point.name.localeCompare(b.point.name, "zh-Hans-CN")
        || a.point.id.localeCompare(b.point.id);
    });
    const separated = [];
    const threshold = (denseLabels ? 22 : 18) * markerScale;

    while (remaining.length) {
      const seed = remaining.shift();
      const group = [seed];
      for (let index = remaining.length - 1; index >= 0; index -= 1) {
        if (distance(seed.basePosition, remaining[index].basePosition) <= threshold) {
          group.push(remaining.splice(index, 1)[0]);
        }
      }

      if (group.length === 1) {
        separated.push({ ...seed, position: seed.basePosition });
        continue;
      }

      const spread = Math.min(denseLabels ? 38 : 34, (denseLabels ? 12 : 12) + group.length * (denseLabels ? 2.4 : 2.2)) * markerScale;
      group.forEach((entry, index) => {
        const angle = -Math.PI / 2 + (index * 2 * Math.PI) / group.length;
        separated.push({
          ...entry,
          position: {
            x: round(entry.basePosition.x + Math.cos(angle) * spread),
            y: round(entry.basePosition.y + Math.sin(angle) * spread)
          }
        });
      });
    }

    return separated;
  }

  function shouldRenderLabel(labelMode, point, pointEvents, active) {
    if (labelMode === "all") return true;
    if (labelMode === "main") return !isTaiwanPoint(point);
    if (labelMode === "sparse") return active || pointEvents.length >= 3;
    return active;
  }

  function placeLabel(text, position, radius, fontSize, markerScale, placedLabels, denseLabels = false, labelBounds = null) {
    const width = Math.max(16 * markerScale, estimateTextWidth(text, fontSize));
    const height = fontSize * 1.35;
    const gap = Math.max(2.4 * markerScale, fontSize * 0.45);
    const padding = Math.max(1.2 * markerScale, fontSize * (denseLabels ? 0.56 : 0.36));
    const reach = Math.max(radius + gap, fontSize * (denseLabels ? 5.6 : 3.4));
    const boundsPadding = Math.max(2.5, fontSize * 0.72);
    const candidates = [
      { x: position.x + radius + gap, y: position.y + height * 0.34 },
      { x: position.x - radius - gap - width, y: position.y + height * 0.34 },
      { x: position.x - width / 2, y: position.y - radius - gap },
      { x: position.x - width / 2, y: position.y + radius + gap + height },
      { x: position.x + radius + gap, y: position.y - radius - gap },
      { x: position.x + radius + gap, y: position.y + radius + gap + height },
      { x: position.x - radius - gap - width, y: position.y - radius - gap },
      { x: position.x - radius - gap - width, y: position.y + radius + gap + height }
    ];

    for (let ring = 1; ring <= 24; ring += 1) {
      const slots = 10 + ring * (denseLabels ? 8 : 5);
      const distanceFromPoint = reach + ring * reach * (denseLabels ? 1.08 : 0.82);
      for (let index = 0; index < slots; index += 1) {
        const angle = -Math.PI / 2 + (index * 2 * Math.PI) / slots;
        const centerX = position.x + Math.cos(angle) * distanceFromPoint;
        const centerY = position.y + Math.sin(angle) * distanceFromPoint;
        candidates.push({
          x: centerX - width / 2,
          y: centerY + height / 2,
          leader: true
        });
      }
    }

    for (const candidate of candidates) {
      const box = labelBox(candidate, width, height, padding);
      if (isLabelBoxInBounds(box, labelBounds, boundsPadding) && !placedLabels.some((placed) => boxesOverlap(box, placed))) {
        return {
          x: round(candidate.x),
          y: round(candidate.y),
          box,
          leader: Boolean(candidate.leader),
          anchorX: round(clamp(position.x, box.x1, box.x2)),
          anchorY: round(clamp(position.y, box.y1, box.y2))
        };
      }
    }

    const fallback = clampLabelCandidate(candidates[candidates.length - 1], width, height, padding, labelBounds, boundsPadding);
    const box = labelBox(fallback, width, height, padding);
    return {
      x: round(fallback.x),
      y: round(fallback.y),
      box,
      leader: true,
      anchorX: round(clamp(position.x, box.x1, box.x2)),
      anchorY: round(clamp(position.y, box.y1, box.y2))
    };
  }

  function labelBox(candidate, width, height, padding) {
    return {
      x1: candidate.x - padding,
      y1: candidate.y - height - padding,
      x2: candidate.x + width + padding,
      y2: candidate.y + padding
    };
  }

  function estimateTextWidth(text, fontSize) {
    return [...text].reduce((total, char) => {
      return total + fontSize * (/[\u0000-\u00ff]/.test(char) ? 0.62 : 1.02);
    }, 0);
  }

  function isLabelBoxInBounds(box, bounds, padding = 0) {
    if (!bounds) return true;
    return box.x1 >= bounds.x + padding
      && box.y1 >= bounds.y + padding
      && box.x2 <= bounds.x + bounds.width - padding
      && box.y2 <= bounds.y + bounds.height - padding;
  }

  function clampLabelCandidate(candidate, width, height, padding, bounds, boundsPadding = 0) {
    if (!bounds) return candidate;
    const minX = bounds.x + boundsPadding + padding;
    const maxX = bounds.x + bounds.width - boundsPadding - padding - width;
    const minY = bounds.y + boundsPadding + padding + height;
    const maxY = bounds.y + bounds.height - boundsPadding - padding;
    return {
      ...candidate,
      x: clamp(candidate.x, minX, Math.max(minX, maxX)),
      y: clamp(candidate.y, minY, Math.max(minY, maxY)),
      leader: true
    };
  }

  function boxesOverlap(a, b) {
    return a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
  }

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function getCategoryMeta(category) {
    return categoryMeta[category] || { label: category || "未分类", color: "#667085" };
  }

  function translatePlaceType(type) {
    return placeTypeLabels[type] || type || "-";
  }

  function translatePrecision(precision) {
    return precisionLabels[precision] || precision || "-";
  }

  function selectEvent(eventId) {
    state.activeEventId = eventId;
    const event = geocodedEvents.find((item) => item.id === eventId);
    if (event && !event.points.some((point) => point.id === state.activePlaceId)) {
      state.activePlaceId = primaryPointForEvent(event)?.id || null;
    }
  }

  function selectPlace(placeId, eventId = null) {
    state.activePlaceId = placeId;
    const relatedEvent = eventId
      ? geocodedEvents.find((event) => event.id === eventId)
      : placeEventMap.get(placeId)?.[0];
    if (relatedEvent) state.activeEventId = relatedEvent.id;
  }

  function primaryPointForEvent(event) {
    return event?.points?.find((point) => !point.needsReview) || event?.points?.[0] || null;
  }

  function renderPlaceDetail(visibleEvents) {
    const place = places.get(state.activePlaceId);
    const relatedEvents = placeEventMap.get(state.activePlaceId) || [];

    if (!state.activePlaceId) {
      document.querySelector("#detailDate").textContent = "等待选择";
      document.querySelector("#detailTitle").textContent = "选择一个地图地点";
      document.querySelector("#detailSummary").textContent = "点击地图中的地点，查看地点说明与关联事件。";
      document.querySelector("#detailPlaces").textContent = "-";
      document.querySelector("#detailSource").textContent = "-";
      return;
    }

    if (!place || !relatedEvents.length) {
      document.querySelector("#detailDate").textContent = "没有匹配";
      document.querySelector("#detailTitle").textContent = "没有可显示地点";
      document.querySelector("#detailSummary").textContent = "点击地图中的地点，查看地点说明与关联事件。";
      document.querySelector("#detailPlaces").textContent = "-";
      document.querySelector("#detailSource").textContent = "-";
      return;
    }

    const properties = place.properties || {};
    const coordinates = place.geometry?.coordinates || [];
    const aliases = properties.aliases?.length ? properties.aliases.join("、") : "无";
    const review = properties.needs_review ? "待复核" : "已确认";
    const coordinateText = coordinates.length ? `${coordinates[0]}, ${coordinates[1]}` : "-";
    const activeEvent = visibleEvents.find((event) => event.id === state.activeEventId);

    document.querySelector("#detailDate").textContent = "地点详情";
    document.querySelector("#detailTitle").textContent = properties.name_zh || place.id;
    document.querySelector("#detailSummary").textContent = properties.notes || "暂未记录地点说明。";
    document.querySelector("#detailPlaces").innerHTML = `
      <span>类型：${escapeHtml(translatePlaceType(properties.place_type))}</span>
      <span>精度：${escapeHtml(translatePrecision(properties.coordinate_precision))}</span>
      <span>状态：${escapeHtml(review)}</span>
      <span>坐标：${escapeHtml(coordinateText)}</span>
      <span>别名：${escapeHtml(aliases)}</span>
    `;
    document.querySelector("#detailSource").innerHTML = relatedEvents.map((event) => `
      <article class="place-event-link${event.id === state.activeEventId ? " active" : ""}" data-event-id="${escapeHtml(event.id)}">
        <strong>${escapeHtml(event.date_label)}</strong>
        <span>${escapeHtml(event.title)}</span>
      </article>
    `).join("");
    document.querySelectorAll(".place-event-link").forEach((link) => {
      link.addEventListener("click", () => {
        state.activeEventId = link.dataset.eventId;
        stopPlayback();
        render();
      });
    });

    if (activeEvent) {
      const activeButton = timeline.querySelector(`[data-event-id="${activeEvent.id}"]`);
      scrollTimelineTo(activeButton);
    }
  }

  function startPlayback() {
    const visibleEvents = filteredEvents();
    if (!visibleEvents.length) return;
    const activeIndex = visibleEvents.findIndex((event) => event.id === state.activeEventId);
    state.playing = true;
    state.playIndex = activeIndex >= 0 && activeIndex < visibleEvents.length - 1 ? activeIndex : 0;
    activatePlaybackEvent(visibleEvents[state.playIndex]);
    render();
    state.timer = window.setInterval(() => {
      const current = filteredEvents();
      if (!current.length) {
        stopPlayback();
        return;
      }
      if (state.playIndex >= current.length - 1) {
        stopPlayback();
        render();
        return;
      }
      state.playIndex += 1;
      activatePlaybackEvent(current[state.playIndex]);
      render();
    }, 1500);
  }

  function activatePlaybackEvent(event) {
    state.activeEventId = event?.id;
    state.activePlaceId = primaryPointForEvent(event)?.id || null;
  }

  function stopPlayback() {
    state.playing = false;
    if (state.timer) {
      window.clearInterval(state.timer);
      state.timer = null;
    }
  }

  function scrollTimelineTo(activeButton) {
    if (!activeButton) return;
    const wrap = activeButton.closest(".timeline-wrap");
    if (!wrap) return;
    const target = activeButton.offsetLeft - (wrap.clientWidth - activeButton.offsetWidth) / 2;
    wrap.scrollTo({ left: Math.max(0, target), behavior: state.playing ? "auto" : "smooth" });
  }

  function setNamedView(name) {
    setViewBox(namedViewBoxes[name] || namedViewBoxes.all);
    renderMap(filteredEvents());
  }

  function focusTaiwanDetailMap() {
    setTaiwanViewBox(fullTaiwanViewBox);
    renderMap(filteredEvents());
    document.querySelector(".taiwan-map-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function zoomMap(factor, center = null) {
    const minWidth = 55;
    const maxWidth = fullViewBox.width;
    const nextWidth = Math.max(minWidth, Math.min(maxWidth, state.viewBox.width * factor));
    const nextHeight = nextWidth * (fullViewBox.height / fullViewBox.width);
    const anchor = center || {
      x: state.viewBox.x + state.viewBox.width / 2,
      y: state.viewBox.y + state.viewBox.height / 2
    };
    const ratioX = (anchor.x - state.viewBox.x) / state.viewBox.width;
    const ratioY = (anchor.y - state.viewBox.y) / state.viewBox.height;
    setViewBox({
      x: anchor.x - nextWidth * ratioX,
      y: anchor.y - nextHeight * ratioY,
      width: nextWidth,
      height: nextHeight
    });
    renderMap(filteredEvents());
  }

  function zoomTaiwanMap(factor, center = null) {
    const minWidth = 70;
    const maxWidth = fullTaiwanViewBox.width;
    const nextWidth = Math.max(minWidth, Math.min(maxWidth, state.taiwanViewBox.width * factor));
    const nextHeight = nextWidth * (fullTaiwanViewBox.height / fullTaiwanViewBox.width);
    const anchor = center || {
      x: state.taiwanViewBox.x + state.taiwanViewBox.width / 2,
      y: state.taiwanViewBox.y + state.taiwanViewBox.height / 2
    };
    const ratioX = (anchor.x - state.taiwanViewBox.x) / state.taiwanViewBox.width;
    const ratioY = (anchor.y - state.taiwanViewBox.y) / state.taiwanViewBox.height;
    setTaiwanViewBox({
      x: anchor.x - nextWidth * ratioX,
      y: anchor.y - nextHeight * ratioY,
      width: nextWidth,
      height: nextHeight
    });
    renderMap(filteredEvents());
  }

  function setViewBox(viewBox) {
    state.viewBox = clampViewBox(viewBox);
    svg.setAttribute("viewBox", `${round(state.viewBox.x)} ${round(state.viewBox.y)} ${round(state.viewBox.width)} ${round(state.viewBox.height)}`);
  }

  function setTaiwanViewBox(viewBox) {
    state.taiwanViewBox = clampTaiwanViewBox(viewBox);
    taiwanSvg.setAttribute("viewBox", `${round(state.taiwanViewBox.x)} ${round(state.taiwanViewBox.y)} ${round(state.taiwanViewBox.width)} ${round(state.taiwanViewBox.height)}`);
  }

  function clampViewBox(viewBox) {
    const width = Math.max(55, Math.min(fullViewBox.width, viewBox.width));
    const height = Math.max(41.8, Math.min(fullViewBox.height, viewBox.height));
    const maxX = fullViewBox.x + fullViewBox.width - width;
    const maxY = fullViewBox.y + fullViewBox.height - height;
    return {
      x: Math.max(fullViewBox.x, Math.min(maxX, viewBox.x)),
      y: Math.max(fullViewBox.y, Math.min(maxY, viewBox.y)),
      width,
      height
    };
  }

  function clampTaiwanViewBox(viewBox) {
    const width = Math.max(70, Math.min(fullTaiwanViewBox.width, viewBox.width));
    const height = Math.max(53.2, Math.min(fullTaiwanViewBox.height, viewBox.height));
    const maxX = fullTaiwanViewBox.x + fullTaiwanViewBox.width - width;
    const maxY = fullTaiwanViewBox.y + fullTaiwanViewBox.height - height;
    return {
      x: Math.max(fullTaiwanViewBox.x, Math.min(maxX, viewBox.x)),
      y: Math.max(fullTaiwanViewBox.y, Math.min(maxY, viewBox.y)),
      width,
      height
    };
  }

  function pointerToSvg(event) {
    const rect = svg.getBoundingClientRect();
    return {
      x: state.viewBox.x + ((event.clientX - rect.left) / rect.width) * state.viewBox.width,
      y: state.viewBox.y + ((event.clientY - rect.top) / rect.height) * state.viewBox.height
    };
  }

  function pointerToTaiwanSvg(event) {
    const rect = taiwanSvg.getBoundingClientRect();
    return {
      x: state.taiwanViewBox.x + ((event.clientX - rect.left) / rect.width) * state.taiwanViewBox.width,
      y: state.taiwanViewBox.y + ((event.clientY - rect.top) / rect.height) * state.taiwanViewBox.height
    };
  }

  function addTouchGestures(element, options) {
    element.addEventListener("touchstart", (event) => {
      if (event.touches.length === 1 && event.target.closest?.(".marker-group")) return;
      if (event.touches.length > 2) return;
      event.preventDefault();
      options.zoomClassTarget.classList.add("dragging");
      options.setGesture(createTouchGesture(event, element, options.getViewBox()));
    }, { passive: false });

    element.addEventListener("touchmove", (event) => {
      const gesture = options.getGesture();
      if (!gesture || !event.touches.length) return;
      event.preventDefault();

      if (event.touches.length === 1 && gesture.mode === "drag") {
        const touch = event.touches[0];
        const scaleX = gesture.viewBox.width / element.clientWidth;
        const scaleY = gesture.viewBox.height / element.clientHeight;
        options.setViewBox({
          x: gesture.viewBox.x - (touch.clientX - gesture.startClient.x) * scaleX,
          y: gesture.viewBox.y - (touch.clientY - gesture.startClient.y) * scaleY,
          width: gesture.viewBox.width,
          height: gesture.viewBox.height
        });
        return;
      }

      if (event.touches.length === 2) {
        const pinch = gesture.mode === "pinch" ? gesture : createTouchGesture(event, element, options.getViewBox());
        if (gesture.mode !== "pinch") options.setGesture(pinch);
        const currentDistance = touchDistance(event.touches[0], event.touches[1]);
        if (!currentDistance) return;
        const factor = pinch.startDistance / currentDistance;
        const nextWidth = pinch.viewBox.width * factor;
        const nextHeight = pinch.viewBox.height * factor;
        const ratioX = (pinch.center.x - pinch.viewBox.x) / pinch.viewBox.width;
        const ratioY = (pinch.center.y - pinch.viewBox.y) / pinch.viewBox.height;
        options.setViewBox({
          x: pinch.center.x - nextWidth * ratioX,
          y: pinch.center.y - nextHeight * ratioY,
          width: nextWidth,
          height: nextHeight
        });
        renderMap(filteredEvents());
      }
    }, { passive: false });

    element.addEventListener("touchend", (event) => {
      if (event.touches.length) {
        options.setGesture(createTouchGesture(event, element, options.getViewBox()));
        return;
      }
      options.setGesture(null);
      options.zoomClassTarget.classList.remove("dragging");
    }, { passive: false });

    element.addEventListener("touchcancel", () => {
      options.setGesture(null);
      options.zoomClassTarget.classList.remove("dragging");
    }, { passive: false });
  }

  function createTouchGesture(event, element, viewBox) {
    if (event.touches.length === 2) {
      return {
        mode: "pinch",
        viewBox: { ...viewBox },
        startDistance: touchDistance(event.touches[0], event.touches[1]),
        center: clientToViewBox(touchCenter(event.touches[0], event.touches[1]), element, viewBox)
      };
    }

    const touch = event.touches[0];
    return {
      mode: "drag",
      viewBox: { ...viewBox },
      startClient: { x: touch.clientX, y: touch.clientY }
    };
  }

  function clientToViewBox(clientPoint, element, viewBox) {
    const rect = element.getBoundingClientRect();
    return {
      x: viewBox.x + ((clientPoint.x - rect.left) / rect.width) * viewBox.width,
      y: viewBox.y + ((clientPoint.y - rect.top) / rect.height) * viewBox.height
    };
  }

  function touchDistance(a, b) {
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }

  function touchCenter(a, b) {
    return {
      x: (a.clientX + b.clientX) / 2,
      y: (a.clientY + b.clientY) / 2
    };
  }

  function endDrag(event) {
    if (!state.dragging) return;
    if (event.pointerId === state.dragging.pointerId) {
      state.dragging = null;
      svg.classList.remove("dragging");
    }
  }

  function endTaiwanDrag(event) {
    if (!state.taiwanDragging) return;
    if (event.pointerId === state.taiwanDragging.pointerId) {
      state.taiwanDragging = null;
      taiwanSvg.classList.remove("dragging");
    }
  }

  function drawBaseMap() {
    const grid = [];
    for (let lng = 108; lng <= 128; lng += 4) {
      const a = project([lng, 19]);
      const b = project([lng, 48]);
      grid.push(`<line class="grid-line" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"></line>`);
    }
    for (let lat = 20; lat <= 48; lat += 4) {
      const a = project([107, lat]);
      const b = project([129, lat]);
      grid.push(`<line class="grid-line" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"></line>`);
    }

    const mainland = polygon([
      [108.2, 21.4], [110.8, 20.3], [113.3, 21.7], [116.1, 22.7], [119.0, 25.2],
      [121.5, 28.5], [122.5, 31.5], [121.6, 34.0], [119.0, 36.7], [121.5, 39.0],
      [124.0, 40.7], [127.3, 43.6], [128.0, 47.0], [122.5, 47.5], [118.4, 45.0],
      [115.0, 42.0], [112.4, 39.2], [110.2, 35.1], [108.6, 30.5], [107.8, 25.2]
    ]);
    const taiwan = polygon([
      [120.0, 21.9], [121.0, 22.2], [121.8, 23.3], [122.0, 24.5], [121.7, 25.3],
      [121.0, 25.5], [120.3, 24.9], [120.0, 23.7], [119.8, 22.7]
    ]);
    const hainan = polygon([[109.1, 18.2], [110.5, 18.0], [111.2, 19.1], [110.0, 20.1], [108.9, 19.4]]);
    const penghu = polygon([[119.45, 23.45], [119.72, 23.47], [119.73, 23.68], [119.48, 23.72]]);

    baseMap.innerHTML = `
      ${grid.join("")}
      <path class="land" d="${mainland}"></path>
      <path class="land" d="${taiwan}"></path>
      <path class="land" d="${hainan}"></path>
      <path class="land" d="${penghu}"></path>
      <text class="region-label" x="${project([116.4, 39.9]).x + 12}" y="${project([116.4, 39.9]).y - 12}">北京</text>
      <text class="region-label" x="${project([121.5, 31.2]).x + 12}" y="${project([121.5, 31.2]).y - 12}">上海</text>
      <text class="region-label" x="${project([120.7, 24.1]).x + 12}" y="${project([120.7, 24.1]).y - 12}">台中</text>
      <text class="region-label" x="${project([121.5, 25.0]).x + 12}" y="${project([121.5, 25.0]).y - 12}">台北</text>
    `;
  }

  function drawTaiwanBaseMap() {
    const grid = [];
    for (let lng = 119.5; lng <= 122.5; lng += 0.5) {
      const a = projectTaiwan([lng, 21.6]);
      const b = projectTaiwan([lng, 25.7]);
      grid.push(`<line class="grid-line" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"></line>`);
    }
    for (let lat = 22; lat <= 25.5; lat += 0.5) {
      const a = projectTaiwan([119.2, lat]);
      const b = projectTaiwan([122.4, lat]);
      grid.push(`<line class="grid-line" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"></line>`);
    }

    const taiwan = polygon([
      [120.0, 21.9], [121.0, 22.2], [121.8, 23.3], [122.0, 24.5], [121.7, 25.3],
      [121.0, 25.5], [120.3, 24.9], [120.0, 23.7], [119.8, 22.7]
    ], projectTaiwan);
    const penghu = polygon([[119.45, 23.45], [119.72, 23.47], [119.73, 23.68], [119.48, 23.72]], projectTaiwan);

    taiwanBaseMap.innerHTML = `
      ${grid.join("")}
      <path class="land" d="${taiwan}"></path>
      <path class="land" d="${penghu}"></path>
      <text class="region-label" x="${projectTaiwan([121.52, 25.05]).x + 8}" y="${projectTaiwan([121.52, 25.05]).y - 8}">台北</text>
      <text class="region-label" x="${projectTaiwan([120.68, 24.14]).x + 8}" y="${projectTaiwan([120.68, 24.14]).y + 3}">台中</text>
      <text class="region-label" x="${projectTaiwan([120.99, 24.78]).x + 8}" y="${projectTaiwan([120.99, 24.78]).y + 3}">新竹</text>
      <text class="region-label" x="${projectTaiwan([120.22, 22.99]).x + 8}" y="${projectTaiwan([120.22, 22.99]).y + 3}">台南</text>
    `;
  }

  function polygon(coordinates, projectFn = project) {
    return coordinates.map((coordinate, index) => {
      const point = projectFn(coordinate);
      return `${index ? "L" : "M"} ${point.x} ${point.y}`;
    }).join(" ") + " Z";
  }

  function project([lng, lat]) {
    const bounds = { minLng: 107, maxLng: 129, minLat: 18, maxLat: 48 };
    const width = 1000;
    const height = 760;
    const pad = 58;
    const x = pad + ((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * (width - pad * 2);
    const y = height - pad - ((lat - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * (height - pad * 2);
    return { x: round(x), y: round(y) };
  }

  function projectTaiwan([lng, lat]) {
    const bounds = { minLng: 119.2, maxLng: 122.4, minLat: 21.6, maxLat: 25.7 };
    const width = 1000;
    const height = 760;
    const pad = 58;
    const x = pad + ((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * (width - pad * 2);
    const y = height - pad - ((lat - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * (height - pad * 2);
    return { x: round(x), y: round(y) };
  }

  function isTaiwanPoint(point) {
    const [lng, lat] = point.coordinates;
    return lng >= 119.2 && lng <= 122.4 && lat >= 21.6 && lat <= 25.7;
  }

  function shortName(name) {
    return name
      .replace("台湾省立", "")
      .replace("国立", "")
      .replace("附近", "")
      .replace("（上海）", "")
      .slice(0, 12);
  }

  function round(value) {
    return Math.round(value * 10) / 10;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeSvgText(value) {
    return escapeHtml(value).replace(/'/g, "&apos;");
  }
})().catch((error) => {
  document.body.innerHTML = `<main class="empty-state">地图加载失败：${String(error.message || error)}</main>`;
});
