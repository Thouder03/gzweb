#!/bin/bash
set -e

# 设置 GAZEBO_MODEL_PATH 环境变量
export GAZEBO_MODEL_PATH=$GAZEBO_MODEL_PATH:/root/catkin_ws/src/bingda_tutorials/models:/root/catkin_ws/src

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

sleep 3

roslaunch bingda_tutorials simulation_robot.launch &

echo "正在启动仿真..."

# 等待仿真完全加载
sleep 8

echo "所有服务已就绪，正在启动 gzweb..."
npm start