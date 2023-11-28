mkdir -p ${HOME}/minio/data
sudo chmod 0777 -R ${HOME}/minio/data
docker run \
   -p 9000:9000 \
   -p 9090:9090 \
   --user $(id -u):$(id -g) \
   --name minio1 \
   -e "MINIO_ROOT_USER=user" \
   -e "MINIO_ROOT_PASSWORD=change_me123" \
   -v ${HOME}/minio/data:/data \
   quay.io/minio/minio server /data --console-address ":9090"