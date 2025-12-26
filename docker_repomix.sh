# 加载 nvm 环境
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # 这行会加载 nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # 这行加载补全（可选）

nvm use 22
repomix --include dockerfile,docker-compose.yml,dev_entrypoint.sh --output repomix-docker.xml