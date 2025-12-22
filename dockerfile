FROM osrf/ros:noetic-desktop-full

ENV DEBIAN_FRONTEND=noninteractive
SHELL ["/bin/bash", "-c"]

# 替换 Ubuntu 软件源
RUN sed -i 's/archive.ubuntu.com/mirrors.tuna.tsinghua.edu.cn/g' /etc/apt/sources.list && \
    sed -i 's/security.ubuntu.com/mirrors.tuna.tsinghua.edu.cn/g' /etc/apt/sources.list

# 1. 安装系统工具、图形渲染库、虚拟显示器和 Gazebo 插件
RUN apt-get update && apt-get install -y \
    psmisc \
    xvfb \
    libgl1-mesa-glx \
    libgl1-mesa-dri \
    mesa-utils \
    libjansson4 \
    libjansson-dev \
    imagemagick \
    nodejs \
    npm \
    ros-noetic-gazebo-plugins \
    ros-noetic-move-base-msgs \
    ros-noetic-web-video-server \
    ros-noetic-rosbridge-suite \
    ros-noetic-compressed-image-transport \
    ros-noetic-slam-gmapping \
    ros-noetic-slam-karto \
    ros-noetic-hector-slam \
    ros-noetic-amcl \
    ros-noetic-move-base \
    ros-noetic-map-server \
    ros-noetic-dwa-local-planner \
    ros-noetic-teb-local-planner \
    ros-noetic-global-planner \
    ros-noetic-navfn \
    && rm -rf /var/lib/apt/lists/*

# 2. 设置工作目录（预设，代码通过 compose 挂载）
WORKDIR /root/gzweb


EXPOSE 8080 9090 11311

# 启动脚本
ENTRYPOINT ["/dev_entrypoint.sh"]