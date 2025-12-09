#!/usr/bin/env node

"use strict"

const WebSocketServer = require('websocket').server;
const http = require('http');
const fs = require('fs');
const path = require('path');
const gzbridge = require('./build/Debug/gzbridge');
const { exec, spawn } = require('child_process');

/**
 * Path from where the static site is served
 */
const staticBasePath = './../http/client';

/**
 * Port to serve from, defaults to 8080
 */
const port = process.argv[2] || 8080;

/**
 * Array of websocket connections currently active, if it is empty, there are no
 * clients connected.
 */
let connections = [];

/**
 * Holds the message containing all material scripts in case there is no
 * gzserver connected
 */
let materialScriptsMessage = {};

/**
 * Whether currently connected to a gzserver
 */
let isConnected = false;

/**
 * Callback to serve static files AND handle API requests
 * @param req Request
 * @param res Response
 */
let staticServe = function(req, res) {

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Request-Method', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET, POST'); // 允许 POST
  res.setHeader('Access-Control-Allow-Headers', '*');
 
  // 处理预检 OPTIONS 请求 (CORS)
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  // 1. 处理文件流上传 (放在最前面，不等待 end 事件)
  if (req.method === 'POST' && req.url.startsWith('/upload_node')) {
      // 解析 URL 参数获取文件名
      const urlParams = new URLSearchParams(req.url.split('?')[1]);
      const filename = urlParams.get('filename');
      
      if (!filename) {
          res.writeHead(400);
          res.end('Missing filename');
          return;
      }

      // 目标路径: /home/ubuntu20/catkin_ws/src
      const targetPath = path.join('/home/ubuntu20/catkin_ws/src', filename);
      console.log('Uploading file to:', targetPath);

      const fileStream = fs.createWriteStream(targetPath);
      
      req.pipe(fileStream);

      fileStream.on('error', (err) => {
          console.error('File write error:', err);
          res.writeHead(500);
          res.end('Write Error: ' + err.message);
      });

      fileStream.on('finish', () => {
          res.writeHead(200);
          res.end('Upload Received');
      });
      return; // 结束处理，不要继续向下执行
  }
  // 处理 POST 请求
  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      
      // --- 新增: Node Manager 操作路由 ---
      if (req.url === '/node_manager') {
          try {
              const data = JSON.parse(body);
              const wsPath = '/home/ubuntu20/catkin_ws';
              const srcPath = path.join(wsPath, 'src');

              // A. 解压逻辑
              if (data.action === 'extract') {
                  const filename = data.filename; // e.g., my_pkg.zip
                  const filePath = path.join(srcPath, filename);
                  
                  // 假设文件夹名是文件名去掉后缀
                  // 注意：这只是一个假设，实际解压出的文件夹名取决于压缩包内容
                  // 但为了满足 "删除同名文件夹" 的需求，我们尝试删除 baseName
                  const baseName = path.parse(filename).name;
                  const folderPath = path.join(srcPath, baseName);

                  // 构建 Shell 命令
                  // 1. rm -rf folderPath (删除旧的)
                  // 2. unzip -o filePath -d srcPath (解压，-o 覆盖)
                  let cmd = `rm -rf ${folderPath} && unzip -o ${filePath} -d ${srcPath}`;
                  
                  // 如果是 tar 包
                  if (filename.endsWith('.tar') || filename.endsWith('.tar.gz')) {
                      cmd = `rm -rf ${folderPath} && tar -xvf ${filePath} -C ${srcPath}`;
                  }

                  console.log('Executing extract:', cmd);
                  exec(cmd, (error, stdout, stderr) => {
                      if (error) {
                          res.writeHead(500, {'Content-Type': 'application/json'});
                          res.end(JSON.stringify({ message: 'Extract Error: ' + stderr }));
                      } else {
                          res.writeHead(200, {'Content-Type': 'application/json'});
                          res.end(JSON.stringify({ message: 'Extracted: ' + baseName }));
                      }
                  });
              }
              
                // B. 编译逻辑 (修改为 spawn 以支持实时输出)
                else if (data.action === 'compile') {
                    const wsPath = '/home/ubuntu20/catkin_ws';
                    
                    // 使用 spawn 启动进程，这样可以获得实时输出流
                    // bash -c 允许我们串联命令 (cd && catkin_make)
                    const child = spawn('bash', ['-c', `cd ${wsPath} && catkin_make`]);

                    // 设置响应头，告诉浏览器这是一个文本流
                    res.writeHead(200, {'Content-Type': 'text/plain'});

                    // 监听标准输出 (stdout)
                    child.stdout.on('data', (chunk) => {
                        // 将输出实时写入 HTTP 响应
                        res.write(chunk); 
                    });

                    // 监听标准错误 (stderr) - catkin_make 的进度信息有时也在 stderr 中
                    child.stderr.on('data', (chunk) => {
                        res.write(chunk);
                    });

                    // 监听进程结束
                    child.on('close', (code) => {
                        if (code === 0) {
                            res.end('\n[Build Complete] Success');
                        } else {
                            res.end('\n[Build Failed] Exit code: ' + code);
                        }
                    });
                    
                    // 这里的 return 非常重要，防止外部代码继续执行
                    return; 
                }

          } catch(e) {
              res.writeHead(500);
              res.end(JSON.stringify({message: 'Server Error: ' + e.message}));
          }
          return;
      }
      // --- 结束 Node Manager 路由 ---

      if (req.url === '/code_editor') {
        try {
          const data = JSON.parse(body);
          const action = data.action;
          const filePath = data.path;
          
          // ------------------ 路径解析和安全检查 (修正版) ------------------
          
          // 1. 尝试找到 gzweb 项目的根目录
          // 假设 staticBasePath = './../http/client' (标准 gzbridge 路径)
          // 那么 path.resolve(staticBasePath, '..', '..') 应该能解析到 gzweb 根目录。
          //const rootDir = path.resolve(staticBasePath, '..', '..');
          const rootDir = '/home/ubuntu20/catkin_ws/src';

          // 2. 将用户路径解析为绝对路径
          const absolutePath = path.resolve(rootDir, filePath);
          
          // 3. 安全检查：确保文件操作限制在 rootDir 及其子目录
          if (!absolutePath.startsWith(rootDir)) {
              console.error('Security violation: Attempted path traversal for:', filePath);
              res.writeHead(403, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Invalid file path. Path must be inside project root.' }));
              return;
          }

          // 4. 关键修复：确保父目录存在，否则写入文件会失败
          const dir = path.dirname(absolutePath);
          if (!fs.existsSync(dir)) {
              // 使用 { recursive: true } 自动创建所有缺失的父目录
              fs.mkdirSync(dir, { recursive: true });
          }
          
          // ------------------ 文件操作逻辑 ------------------

          if (action === 'load') {
            fs.readFile(absolutePath, 'utf8', (err, content) => {
              if (err) {
                console.error('Error reading file:', absolutePath, err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                // 返回具体的系统错误信息
                res.end(JSON.stringify({ error: 'System Error: ' + err.message })); 
              } else {
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end(content);
              }
            });
          } 
          else if (action === 'save') {
            const content = data.content || '';
            
            fs.writeFile(absolutePath, content, 'utf8', (err) => {
              if (err) {
                console.error('Error writing file:', absolutePath, err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                // 返回具体的系统错误信息
                res.end(JSON.stringify({ error: 'System Error: ' + err.message }));
              } else {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'saved' }));
              }
            });
          }
          else {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid action.' }));
          }
        } catch (e) {
          console.error('Processing Error:', e);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Server Processing Error: ' + e.message }));
        }
        return; 
      }

    // ********** 新增的 ROSRUN 路由 **********
    if (req.url === '/rosrun') {
      try {
        const data = JSON.parse(body);
        const pkg = data.package;
        const file = data.file;

        if (!pkg || !file) {
          throw new Error('Missing "package" or "file" in JSON body');
        }
        
        // 调用 C++ 插件的新函数
        gzNode.rosRun(pkg, file); 

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', message: 'RosRun command issued.' }));
        
      } catch (e) {
        console.error('Processing /rosrun Error:', e);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Processing Error: ' + e.message }));
      }
      return; // 结束 /rosrun 路由处理
    }
    // ********** 结束新增的 ROSRUN 路由 **********

    if (req.url === '/rosstop') { 
        gzNode.rosStop(); // 调用 C++
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'stopped' }));
        return;
    }

    // API 端点：用于加载新 world
    if (req.url === '/load_world') {
        try {
          const postData = JSON.parse(body);
          if (postData.world) {
            console.log(new Date() + ' Received request to load world: ' + postData.world);
            
            // 调用 GZNode C++ 插件中的新函数
            gzNode.loadWorld(postData.world); 
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', message: 'Load world command issued for ' + postData.world }));
          } else {
            throw new Error('Missing "world" key in JSON body');
          }
        } catch (e) {
          console.error('Failed to parse /load_world request:', e.message);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'error', message: e.message }));
        }
      }

    if (req.url === '/load_launch') {
      try {
        const data = JSON.parse(body);
        const pkg = data.package;
        const file = data.file;
        
        console.log('Received Load Launch request:', pkg, file);
        gzNode.loadLaunch(pkg, file); // 调用 C++

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', message: 'Launch command issued.' }));
      } catch (e) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }
    
    });
    return; // 不再继续处理静态文件
  }
  
  if (req.url === '/roslogs' && req.method === 'GET') {
      // 调用 C++ 获取日志内容
      const logs = gzNode.getRosLogs(); 
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(logs);
      return;
  }

  // --- 原有的静态文件服务逻辑 ---

  let fileLoc = path.resolve(staticBasePath);

  if (req.url === '/')
    req.url = '/index.html';

  fileLoc = path.join(fileLoc, req.url);

  fs.readFile(fileLoc, function(err, data) {
    if (err) {
        res.writeHead(404, {'Content-Type': 'text/plain'});
        res.write('404 Not Found\n');
        res.end();
        console.log('404: ' + fileLoc);
        return;
    }

    let headers = {};
    let ext = path.extname(fileLoc);
    if (ext === '.js')
        headers['Content-Type'] = 'application/javascript';
    else if (ext === '.css')
        headers['Content-Type'] = 'text/css';
    else if (ext === '.html')
        headers['Content-Type'] = 'text/html';
    else if (ext === '.png')
        headers['Content-Type'] = 'image/png';
    else if (ext === '.ico')
        headers['Content-Type'] = 'image/x-icon';
    // ... 可根据需要添加其他 mime 类型 ...

    res.writeHead(200, headers);
    res.write(data);
    res.end();
  });
};

// HTTP server
let httpServer = http.createServer(staticServe);
httpServer.listen(port);

console.log(new Date() + " Static server listening on port: " + port);

// Websocket
let gzNode = new gzbridge.GZNode();
if (gzNode.getIsGzServerConnected())
{
  gzNode.loadMaterialScripts(staticBasePath + '/assets');
  gzNode.setPoseMsgFilterMinimumAge(0.02);
  gzNode.setPoseMsgFilterMinimumDistanceSquared(0.00001);
  gzNode.setPoseMsgFilterMinimumQuaternionSquared(0.00001);

  console.log('--------------------------------------------------------------');
  console.log('Gazebo transport node connected to gzserver.');
  console.log('Pose message filter parameters between successive messages: ');
  console.log('  minimum seconds: ' +
      gzNode.getPoseMsgFilterMinimumAge());
  console.log('  minimum XYZ distance squared: ' +
      gzNode.getPoseMsgFilterMinimumDistanceSquared());
  console.log('  minimum Quartenion distance squared:'
      + ' ' + gzNode.getPoseMsgFilterMinimumQuaternionSquared());
  console.log('--------------------------------------------------------------');
}
else
{
  materialScriptsMessage =
      gzNode.getMaterialScriptsMessage(staticBasePath + '/assets');
}

// Start websocket server
let wsServer = new WebSocketServer({
  httpServer: httpServer,
  // You should not use autoAcceptConnections for production
  // applications, as it defeats all standard cross-origin protection
  // facilities built into the protocol and the browser.  You should
  // *always* verify the connection's origin and decide whether or not
  // to accept it.
  autoAcceptConnections: false
});

wsServer.on('request', function(request) {

  // Accept request
  let connection = request.accept(null, request.origin);

  // If gzserver is not connected just send material scripts and status
  if (!gzNode.getIsGzServerConnected())
  {
    // create error status and send it
    let statusMessage =
        '{"op":"publish","topic":"~/status","msg":{"status":"error"}}';
    connection.sendUTF(statusMessage);
    // send material scripts message
    connection.sendUTF(materialScriptsMessage);
    return;
  }

  connections.push(connection);

  if (!isConnected)
  {
    isConnected = true;
    gzNode.setConnected(isConnected);
  }

  console.log(new Date() + ' New connection accepted from: ' + request.origin +
      ' ' + connection.remoteAddress);

  // Handle messages received from client
  connection.on('message', function(message) {
    if (message.type === 'utf8') {
      console.log(new Date() + ' Received Message: ' + message.utf8Data +
          ' from ' + request.origin + ' ' + connection.remoteAddress);
      gzNode.request(message.utf8Data);
    }
    else if (message.type === 'binary') {
      console.log(new Date() + ' Received Binary Message of ' +
          message.binaryData.length + ' bytes from ' + request.origin + ' ' +
          connection.remoteAddress);
      connection.sendBytes(message.binaryData);
    }
  });

  // Handle client disconnection
  connection.on('close', function(reasonCode, description) {
    console.log(new Date() + ' Peer ' + request.origin + ' ' +
        connection.remoteAddress + ' disconnected.');

    // remove connection from array
    let conIndex = connections.indexOf(connection);
    connections.splice(conIndex, 1);

    // if there is no connection notify server that there is no connected client
    if (connections.length === 0) {
      isConnected = false;
      gzNode.setConnected(isConnected);
    }
  });
});

// If not connected, periodically send messages
if (gzNode.getIsGzServerConnected())
{
  setInterval(update, 10);

  function update()
  {
    if (connections.length > 0)
    {
      let msgs = gzNode.getMessages();
      for (let i = 0; i < connections.length; ++i)
      {
        for (let j = 0; j < msgs.length; ++j)
        {
          connections[i].sendUTF(msgs[j]);
        }
      }
    }
  }
}
