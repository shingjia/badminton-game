FROM nginx:alpine

# 把反向代理 config 烘進 image，避免 QNAP 上 bind mount 路徑找不到檔案
COPY default.conf /etc/nginx/conf.d/default.conf
