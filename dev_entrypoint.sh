#!/bin/bash
set -e

# 1. 设置环境变量 (使用绝对路径)
WORKSPACE=/home/ubuntu20/catkin_ws
GZWEB_DIR=/home/ubuntu20/gzweb

export GAZEBO_MODEL_PATH=$GAZEBO_MODEL_PATH:$WORKSPACE/src/bingda_tutorials/models:/usr/share/gazebo-11/models

# 2. 加载 ROS 环境并编译工作空间
source "/opt/ros/noetic/setup.bash"
cd $WORKSPACE
echo "正在编译 ROS 工作空间..."
catkin_make
source "$WORKSPACE/devel/setup.bash"

# 3. Gzweb 编译与资源准备
cd $GZWEB_DIR

# 检查 node_modules
if [ ! -d "node_modules" ]; then
    echo "正在安装 npm 依赖..."
    npm install
fi

# 4. 筛选模型并部署 (只需 ground_plane 和 sun)
# 我们通过临时修改搜索路径或手动拷贝来实现
echo "正在准备模型资源 (仅限 ground_plane 和 sun)..."
mkdir -p $GZWEB_DIR/http/client/assets
# 只拷贝特定的基础模型
cp -r /usr/share/gazebo-11/models/ground_plane $GZWEB_DIR/http/client/assets/
cp -r /usr/share/gazebo-11/models/sun $GZWEB_DIR/http/client/assets/

# 执行部署脚本（-m 参数表示处理模型，因为我们已经手动放了模型，这里主要处理必要的素材）
./deploy.sh -m

sleep 3

# 5. 启动 ROS 仿真节点 (后台运行)
# 注意：如果是纯 headless 环境，可能需要 xvfb-run
roslaunch bingda_tutorials simulation_robot.launch &

echo "正在启动仿真..."
sleep 8

# 6. 启动 Gzweb 服务
echo "所有服务已就绪，正在启动 gzweb..."
npm start