for f in *; do
    a="$(echo $f | sed s/.txt//)"
    
    echo "mv $f $a"
    mv "$f" "$a"
done
