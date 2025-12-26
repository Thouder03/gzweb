FROM osrf/ros:noetic-desktop-full

ENV DEBIAN_FRONTEND=noninteractive
SHELL ["/bin/bash", "-c"]

# 替换 Ubuntu 软件源（清华源）
RUN sed -i 's/archive.ubuntu.com/mirrors.tuna.tsinghua.edu.cn/g' /etc/apt/sources.list && \
    sed -i 's/security.ubuntu.com/mirrors.tuna.tsinghua.edu.cn/g' /etc/apt/sources.list

# 1. 安装系统工具、依赖库和 ROS 插件
RUN apt-get update && apt-get install -y \
    git \
    unzip \
    wget \
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
    libgazebo11-dev \
    ros-noetic-gazebo-plugins \
    ros-noetic-rosbridge-suite \
    && rm -rf /var/lib/apt/lists/*

# 2. 创建与主机一致的路径
RUN mkdir -p /home/ubuntu20

# 3. 克隆仓库并解压 catkin_ws
WORKDIR /home/ubuntu20
RUN git clone https://github.com/Thouder03/gzweb.git /home/ubuntu20/gzweb && \
    cd /home/ubuntu20/gzweb && \
    if [ -f "catkin_ws.zip" ]; then \
        unzip catkin_ws.zip -d /home/ubuntu20/ && \
        rm catkin_ws.zip; \
    fi

# 4. 设置工作目录
WORKDIR /home/ubuntu20/gzweb

# 暴露端口
EXPOSE 8080 9090 11311

# 指向仓库自带的 entrypoint 脚本（赋予执行权限）
RUN chmod +x /home/ubuntu20/gzweb/dev_entrypoint.sh
ENTRYPOINT ["/home/ubuntu20/gzweb/dev_entrypoint.sh"]