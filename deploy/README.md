# IP 地址 HTTPS 部署

服务器上的 `cc-explain.service` 以 `cc-explain` 用户运行，Web 服务只监听 `127.0.0.1:3789`。应用版本位于 `/opt/cc-explain/current`，运行配置位于 `/etc/cc-explain/env`，可写工作目录是 `/var/lib/cc-explain`。

公开访问地址是 <https://175.178.166.25/cc-explain/>。nginx 在该路径启用 HTTP Basic Auth，密码文件位于 `/etc/nginx/cc-explain.htpasswd`。应用自身仍只监听本机，因此不要在云安全组中开放 3789 端口。现有 HTTP 站点保持不变。

腾讯云安全组需放行入站 TCP 443；服务器本机 nginx 已监听该端口。若外网连接超时，先检查实例绑定的安全组入站规则，而不是修改应用监听地址。密码只在交付时单独提供，不写入仓库。

短期 IP 证书由 `/opt/certbot-ip/bin/certbot` 管理，`cc-explain-cert-renew.timer` 每天检查两次；成功续期后由 `/etc/letsencrypt/renewal-hooks/deploy/cc-explain-nginx` 重新加载 nginx。证书验证使用现有 HTTP 站点的 `/var/www/drift-bottle-admin`，因此 80 端口需保持可访问。

也可以在自己的电脑上建立 SSH 隧道：

```bash
ssh -N -L 127.0.0.1:13789:127.0.0.1:3789 root@175.178.166.25
```

保持终端窗口运行，然后打开 <http://127.0.0.1:13789/>。这是备用私有访问方式，不经过 HTTPS 入口和 Basic Auth。如果本地 `13789` 端口被占用，可把命令中第一个 `13789` 改成其他空闲端口，并用相同端口打开浏览器。

查看服务状态和日志：

```bash
systemctl status cc-explain.service
journalctl -u cc-explain.service -n 100 --no-pager
```

服务定义见 [`cc-explain.service`](./cc-explain.service)。
