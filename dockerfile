FROM osrf/ros:noetic-desktop-full

ENV DEBIAN_FRONTEND=noninteractive
SHELL ["/bin/bash", "-c"]


# 2. 准备目录并克隆代码
RUN mkdir -p /home/ubuntu20
WORKDIR /home/ubuntu20
# RUN git clone --depth 1 https://github.com/Thouder03/gzweb.git /home/ubuntu20/gzweb
COPY . /home/ubuntu20/gzweb

# 7. 复制启动脚本
COPY dev_entrypoint.sh /home/ubuntu20/gzweb/dev_entrypoint.sh
RUN chmod +x /home/ubuntu20/gzweb/dev_entrypoint.sh

COPY ./tmp/catkin_ws.zip /home/ubuntu20/gzweb


# 1. 替换源并安装基础工具 + gzweb 所需的旧版环境
RUN sed -i 's/archive.ubuntu.com/mirrors.tuna.tsinghua.edu.cn/g' /etc/apt/sources.list && \
    sed -i 's/security.ubuntu.com/mirrors.tuna.tsinghua.edu.cn/g' /etc/apt/sources.list

RUN apt-get update && apt-get install -y \
    git unzip psmisc xvfb \
    libgl1-mesa-glx libgl1-mesa-dri mesa-utils \
    libjansson4 libjansson-dev libboost-dev libtinyxml-dev imagemagick \
    mercurial cmake build-essential \
    libgts-dev \
    nodejs npm \
    python2 python-is-python2 \
    libgazebo11-dev \
    ros-noetic-gazebo-plugins \
    ros-noetic-rosbridge-suite \
    ros-noetic-compressed-image-transport \
    ros-noetic-navigation \
    ros-noetic-gmapping \
    ros-noetic-hector-slam \
    ros-noetic-slam-karto \
    ros-noetic-teb-local-planner \
    && rm -rf /var/lib/apt/lists/*

# 确保 nodejs 命令可以通过 node 访问
RUN ln -s /usr/bin/nodejs /usr/local/bin/node || true

# 3. 解压 catkin_ws
WORKDIR /home/ubuntu20/gzweb
RUN if [ -f "catkin_ws.zip" ]; then \
        unzip catkin_ws.zip -d /home/ubuntu20/ && \
        rm catkin_ws.zip; \
    fi

# 4. 编译 ROS 工作空间
WORKDIR /home/ubuntu20/catkin_ws
RUN rm -rf build/ devel/ install/ .catkin_workspace && \
    source /opt/ros/noetic/setup.bash && catkin_make

# 5. Gzweb 预编译核心步骤
WORKDIR /home/ubuntu20/gzweb

RUN npm config set registry https://registry.npmmirror.com && \
    npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000

# 6. 准备模型资源并执行部署脚本
RUN export GAZEBO_MODEL_PATH=$GAZEBO_MODEL_PATH:/home/ubuntu20/catkin_ws/src/bingda_tutorials/models && \
    source /usr/share/gazebo/setup.sh && ./deploy.sh -m local

EXPOSE 8080 9090 11311

ENTRYPOINT ["/home/ubuntu20/gzweb/dev_entrypoint.sh"]