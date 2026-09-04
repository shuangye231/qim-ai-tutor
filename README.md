# 启码 AI 学伴 Linux 交付版

这是面向 Ubuntu 24.x86_64 服务器的生产部署交付包。系统提供 AI 学习导师、知识库问答、学习路线、课程资料、班级管理、作业中心、OJ 题库、编程竞赛、Scratch 3、学习报告和管理接口。

## 快速部署

```bash
cd /path/to/启码AI学伴-Linux交付版
chmod +x scripts/install_ubuntu.sh scripts/backup.sh
./scripts/install_ubuntu.sh
```

安装脚本会先检查 Ubuntu 和 amd64 架构，再检查/安装 Docker Engine 与 Compose；随后提示甲方自己设置管理员密钥和 AI API Key，拉取 OJ 运行镜像，构建并启动服务。

访问 `http://服务器IP:8899`。完整的功能介绍、配置方法、API 和上线注意事项见 [docs/部署与使用手册.md](docs/部署与使用手册.md)。

## 常用命令

```bash
docker compose ps
docker compose logs -f tutor
docker compose restart tutor
docker compose up -d --build
./scripts/backup.sh
```

## 重要说明

- 本交付版正式入口是 `app.py`，不包含历史 LangChain 实验入口、测试集、开发记录、运行日志、现有数据库、上传资料和模型缓存。
- 当前业务代码使用 SQLite，数据保存在 `data/`；本次没有擅自改成 MySQL。MySQL 可以另行安装，但当前版本不会读取 MySQL，安装它不会改变系统数据存储。
- AI Key、管理员密钥和 `.env` 不上传 GitHub。前端页面插图和 Scratch 3 本地运行资源已保留。
- 当前支付配置为 `mock`，上线收费前必须接入真实支付服务并完成验签、幂等、退款和对账。
