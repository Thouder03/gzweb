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
    && rm -rf /var/lib/apt/lists/*

# 2. 设置工作目录（预设，代码通过 compose 挂载）
WORKDIR /root/gzweb

# 3. 环境变量优化：强制使用软件渲染，防止找不到显卡报错
ENV LIBGL_ALWAYS_SOFTWARE=1
ENV QT_X11_NO_MITSHM=1
ENV GALLIUM_DRIVER=llvmpipe

EXPOSE 8080 9090 11311 8081

# 启动脚本
ENTRYPOINT ["/dev_entrypoint.sh"]