#!/bin/bash
set -e

# 1. 设置环境变量
WORKSPACE=/home/ubuntu20/catkin_ws
GZWEB_DIR=/home/ubuntu20/gzweb

# 这里的路径包含了工作空间的模型路径
export GAZEBO_MODEL_PATH=$GAZEBO_MODEL_PATH:$WORKSPACE/src/bingda_tutorials/models:/usr/share/gazebo-11/models

# 2. 加载环境 (无需再编译)
source "/opt/ros/noetic/setup.bash"
source "$WORKSPACE/devel/setup.bash"

# 3. 启动 ROS 仿真节点 (后台运行)
# 如果是 headless 环境且没有 GPU，可能需要 xvfb-run
roslaunch bingda_tutorials simulation_robot.launch &

echo "正在启动仿真..."
sleep 5

# 4. 启动 Gzweb 服务
cd $GZWEB_DIR
echo "所有构建任务已在镜像中完成，正在启动 gzweb..."
npm start