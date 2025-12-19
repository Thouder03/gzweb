#!/bin/bash
set -e

export LIBGL_ALWAYS_SOFTWARE=1
export GALLIUM_DRIVER=llvmpipe

# 1. 加载 ROS 环境并编译
source "/opt/ros/noetic/setup.bash"
cd /root/catkin_ws
catkin_make
source "/root/catkin_ws/devel/setup.bash"

# 2. Gzweb 依赖与资源检查
cd /root/gzweb
if [ ! -d "node_modules" ]; then
    npm install
fi
if [ ! -d "http/client/assets" ]; then
    ./deploy.sh -m
fi

# 3. 启动基础服务
# roscore &
sleep 3

# 4. 关键：通过 xvfb-run 模拟图形环境启动仿真
# 这样 Gazebo 渲染引擎才能初始化摄像头传感器

# ldconfig
# roslaunch bingda_tutorials simulation_robot.launch &

echo "正在虚拟显示器环境下启动仿真..."
xvfb-run -s "-screen 0 1280x1024x24" roslaunch bingda_tutorials simulation_robot.launch &
# xvfb-run -s "-screen 0 1280x1024x24" \
#     roslaunch bingda_tutorials simulation_robot.launch &

# 等待仿真完全加载
sleep 10

echo "检查话题列表中是否存在摄像头..."
rostopic list | grep image || echo "警告：未找到图像话题，请检查 URDF 插件配置。"

echo "所有服务已就绪，正在启动 gzweb..."
npm start