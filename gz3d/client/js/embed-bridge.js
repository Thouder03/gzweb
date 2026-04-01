/* eslint-disable max-len */
/**
 * embed-bridge.js
 *
 * 在 iframe 内运行的桥接脚本。
 * 负责:
 * 1. 监听父窗口的 postMessage 指令，转发到 gz3d globalEmitter
 * 2. 监听 gz3d 事件，回传状态到父窗口
 *
 * URL 参数:
 * - ws: gzbridge WebSocket 地址 (默认: location.hostname:location.port)
 * - origin: 允许的父窗口来源 (默认: '*')
 */
(function() {
  'use strict';

  // 从 hash fragment 读取参数（不用 query string 因为 gzbridge 会把它拼进文件路径）
  var params = new URLSearchParams(window.location.hash.substring(1));
  var parentOrigin = params.get('origin') || '*';
  var emitter = globalEmitter;

  // ── 辅助: 安全发送到父窗口 ──
  function postToParent(msg) {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(msg, parentOrigin);
    }
  }

  /**
   * 检测实际 WebSocket 连接状态
   *
   * 不使用 iface.isConnected：
   * - gziface.js 在 WebSocket 断开后不会将 isConnected 重置为 false
   * - isConnected 只在 ~/status 话题显式返回 'error' 时才清零
   * 因此直接检查底层 WebSocket 的 readyState 以获取真实状态
   */
  function isGzConnected() {
    if (typeof iface === 'undefined') return false;
    var ws = iface.webSocket && iface.webSocket.socket;
    return ws ? ws.readyState === WebSocket.OPEN : false;
  }

  // ════════════════════════════════════════════
  // L2: 状态回传 (iframe → Vue)
  // ════════════════════════════════════════════

  // 连接状态
  emitter.on('connection', function() {
    postToParent({ type: 'gz:connection', payload: { connected: true } });

    // 连接成功后，监听底层 WebSocket 的 close/error 事件
    // gziface.js 的 connectionError 只在首次连接失败时发出，
    // 连接成功后再断开不会触发，必须在此处补充监听
    if (typeof iface !== 'undefined' && iface.webSocket) {
      iface.webSocket.on('close', function() {
        postToParent({ type: 'gz:connection', payload: { connected: false } });
      });
      iface.webSocket.on('error', function() {
        postToParent({ type: 'gz:connection', payload: { connected: false } });
      });
    }
  });

  emitter.on('connectionError', function() {
    postToParent({ type: 'gz:connection', payload: { connected: false } });
  });

  // 仿真时间
  emitter.on('setSimTime', function(time) {
    postToParent({ type: 'gz:simTime', payload: { simTime: time } });
  });

  emitter.on('setRealTime', function(time) {
    postToParent({ type: 'gz:realTime', payload: { realTime: time } });
  });

  // 暂停状态
  emitter.on('setPaused', function(paused) {
    postToParent({ type: 'gz:paused', payload: { paused: paused } });
  });

  // ════════════════════════════════════════════
  // L1: 接收指令 (Vue → iframe)
  // ════════════════════════════════════════════

  window.addEventListener('message', function(event) {
    // 安全校验
    if (parentOrigin !== '*' && event.origin !== parentOrigin) return;
    var msg = event.data;
    if (!msg || typeof msg.type !== 'string' || !msg.type.startsWith('gz:')) return;

    switch (msg.type) {
      // ── 仿真控制 ──
      case 'gz:pause':
        emitter.emit('pause', msg.payload.paused);
        break;

      case 'gz:reset':
        emitter.emit('reset', msg.payload.resetType || 'world');
        break;

      // ── 视图控制 ──
      case 'gz:resetView':
        if (typeof scene !== 'undefined' && scene.resetView) {
          scene.resetView();
        }
        break;

      case 'gz:showGrid':
        if (typeof scene !== 'undefined' && scene.grid) {
          scene.grid.visible = !!msg.payload.visible;
        }
        break;

      case 'gz:showCollisions':
        if (typeof scene !== 'undefined' && scene.showCollision) {
          // 必须调用 showCollision() 方法，而非直接赋值 showCollisions 属性
          // 该方法会遍历场景中所有 COLLISION_VISUAL 对象并设置可见性
          scene.showCollision(!!msg.payload.visible);
        }
        break;

      case 'gz:showOrbitIndicator':
        if (typeof scene !== 'undefined' && scene.controls) {
          scene.controls.showTargetIndicator = !!msg.payload.visible;
        }
        break;

      // ── 健康检测 ──
      case 'gz:ping':
        // 使用实际 WebSocket readyState 而非 iface.isConnected
        // 原因: iface.isConnected 在 WebSocket 断开后不会自动重置，
        //      导致断连时 pong 仍回 connected=true，父窗口无法感知断连
        postToParent({
          type: 'gz:pong',
          payload: {
            connected: isGzConnected(),
            timestamp: Date.now()
          }
        });
        break;
    }
  });

  // ── 通知父窗口: bridge 已就绪 ──
  postToParent({ type: 'gz:ready', payload: {} });
})();
